const formatter = Intl.NumberFormat('en-US', {
    notation: "compact",
    maximumFractionDigits: 2
});

const width = 960 * 1.5, height = 600 * 1.5;
const svg = d3.select("#map").append("svg").attr("width", width).attr("height", height);

const projection = d3.geoMercator().scale(150).translate([width / 2, height / 1.5]);
const path = d3.geoPath().projection(projection);

// Zoom function
function zoomed(event) {
    svg.selectAll(".country")
        .attr("transform", event.transform)
        .attr("stroke-width", 1 / event.transform.k);
}

// Define initial zoom behavior
const initialZoom = d3.zoom().scaleExtent([1, 8]).on("zoom", zoomed);

// Apply zoom behavior to the SVG element
svg.call(initialZoom);

// Adjust the color scale domain based on your actual data
let colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([2890696.10, 11]);

const yearLabel = d3.select("#yearLabel");
const yearSlider = d3.select("#yearSlider");

const dataUrl = "./data.json";
const geoJsonUrl = "./map.json"; // Your GeoJSON data URL

let emissionsData;
let worldData;
let countryEmissions = {};

const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("padding", "10px")
    .style("background", "rgba(0, 0, 0, 0.7)")
    .style("color", "#fff")
    .style("border-radius", "5px")
    .style("pointer-events", "none")
    .style("opacity", 0);

// Create the legend
const legendWidth = 200, legendHeight = 20;
const legend = d3.select("#map").append("svg")
    .attr("class", "legend")
    .style("position", "absolute")
    .style("width", legendWidth)
    .style("height", legendHeight + 20)
    .style("top", "50px")
    .style("left", "50px")
    .style("background", "white");

const defs = legend.append("defs");

const linearGradient = defs.append("linearGradient")
    .attr("id", "linear-gradient");

linearGradient.selectAll("stop")
    .data(colorScale.ticks().map((t, i, n) => ({
        offset: `${100 * i / n.length}%`,
        color: colorScale(t)
    })))
    .enter().append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d.color);

legend.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", "url(#linear-gradient)");

legend.append("text")
    .attr("class", "legend-text-min")
    .attr("x", 0)
    .attr("y", legendHeight + 15)
    .text(formatter.format(11));

legend.append("text")
    .attr("class", "legend-text-max")
    .attr("x", legendWidth)
    .attr("y", legendHeight + 15)
    .attr("text-anchor", "end")
    .text(formatter.format(2890696.10));

Promise.all([
    d3.json(dataUrl),
    d3.json(geoJsonUrl)
]).then(([data, geojson]) => {
    emissionsData = data;
    worldData = geojson;

    const countries = geojson.features;

    // Create a mapping from numeric ID to ISO Alpha-3 code
    const idToAlpha3 = {};
    countries.forEach(d => {
        idToAlpha3[d.id] = d.properties.name; // Adjust this based on actual property name
    });

    svg.selectAll("path")
        .data(countries)
        .enter().append("path")
        .attr("d", path)
        .attr("class", "country")
        .on("click", function (event, d) {
            const countryName = d.properties.name;
            const alpha3Code = d.id;
            const emission = countryEmissions[alpha3Code];
            const emissionText = emission ? formatter.format(emission) : "Data not available";
            updateComparison(alpha3Code, countryName);
            tooltip.transition().duration(200).style("opacity", .9);
            tooltip.html(`<strong>${countryName}</strong><br/>CO2 Emission: ${emissionText}`)
                .style("left", (event.pageX + 5) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function (d) {
            tooltip.transition().duration(500).style("opacity", 0);
        });

    updateMap(1960);

    yearSlider.on("input", function () {
        const year = +this.value;
        yearLabel.text(year);
        updateMap(year);
        updateLegend(); // Update legend when map is updated
        updatePieCharts(year);
    });

    function updateMap(year) {
        const yearData = emissionsData.filter(d => d.year === year);

        countryEmissions = {};

        // Iterate over each data point
        yearData.forEach(d => {
            // For Soviet countries (excluding Russia) before 1990, use Russian data
            if (d.country_code === "RUS" && year < 1990) {
                // Iterate over each Soviet country
                ["ARM", "AZE", "BLR", "EST", "GEO", "KAZ", "KGZ", "LVA", "LTU", "MDA", "TKM", "TJK", "UKR", "UZB", "RUS", "DEU", "CZE", "SVK", "POL"].forEach(sovietCountry => {
                    countryEmissions[sovietCountry] = d.value;
                });
            } else {
                // For other countries or years after 1990, use regular data
                countryEmissions[d.country_code] = d.value;
            }
        });

        svg.selectAll(".country")
            .attr("fill", d => {
                const alpha3Code = d.id; // Use the id field directly
                const emission = countryEmissions[alpha3Code];
                const color = emission ? colorScale(emission) : "#ccc";
                return color;
            });
    }

    function updateLegend() {
        // Extract the country codes from the map data
        const mapCountryCodes = worldData.features.map(feature => feature.id);

        // Filter out emissions data for countries not present in the map
        const filteredEmissions = Object.entries(countryEmissions)
            .filter(([countryCode, value]) => mapCountryCodes.includes(countryCode))
            .map(([countryCode, value]) => value);

        // Adjusting the color scale domain
        const maxEmission = d3.max(filteredEmissions);
        const minEmission = d3.min(filteredEmissions);
        colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([maxEmission, minEmission]);

        // Fixing the legend text
        legend.select(".legend-text-min").text(formatter.format(minEmission));
        legend.select(".legend-text-max").text(formatter.format(maxEmission));
    }

    let playing = false;
    let timer;

// Function to update the slider value and map
    function updateYear() {
        let year = +yearSlider.property("value");
        if (year < 2019) {
            year += 1;
        } else {
            clearInterval(timer);
            playing = false;
            playButton.text("Play");
            return;
        }
        yearSlider.property("value", year);
        yearLabel.text(year);
        updateMap(year);
        updateLegend(); // Update legend when map is updated
        updatePieCharts(year);
    }

// Handle play button click
    const playButton = d3.select("#playButton");
    playButton.on("click", function () {
        if (playing) {
            clearInterval(timer);
            playing = false;
            playButton.text("Play");
        } else {
            recenterMap();
            timer = setInterval(updateYear, 500); // Update year every 0.5 seconds
            playing = true;
            playButton.text("Pause");
        }
    });

});

// Create a button to recentre the map
const recenterButton = d3.select("#map").append("svg")
    .attr("class", "recenter-button")
    .attr("width", 100)
    .attr("height", 30)
    .style("position", "absolute")
    .style("top", `${height - 50}px`)
    .style("left", `${width - 150}px`);

recenterButton.append("rect")
    .attr("width", 100)
    .attr("height", 30)
    .style("fill", "#107AB0")
    .style("cursor", "pointer")
    .on("click", recenterMap);

recenterButton.append("text")
    .attr("x", 50)
    .attr("y", 17)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "14px")
    .style("cursor", "pointer")
    .on("click", recenterMap)
    .text("Recenter");

function recenterMap() {
    // Reset the zoom and recenter the map
    svg.transition().duration(750).call(
        initialZoom.transform,
        d3.zoomIdentity,
        d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
    );
}

let selectedCountries = [];

function updateComparison(selectedCountry, countryName) {
    // Filter emissions data for the selected country
    const countryData = emissionsData.filter(d => d.country_code === selectedCountry);

    if (!selectedCountries.some(c => c.countryCode === selectedCountry)) {
        if (selectedCountries.length === 2) {
            selectedCountries.shift(); // Remove the first selected country if already two
        }
        selectedCountries.push({ countryCode: selectedCountry, countryName });
    }

    // Clear previous bar charts and pie chart
    d3.selectAll("#bar-chart").remove();
    d3.selectAll("#pie-chart").remove();

    // Create a new SVG for each bar chart
    selectedCountries.forEach((country, index) => {
        const barChartSvg = d3.select("#map").append("svg")
            .attr("id", "bar-chart")
            .attr("width", 400)
            .attr("height", 250)
            .style("position", "absolute")
            .style("top", `${height + 200}px`)
            .style("left", `${index * 550}px`);

        // Add country name above the bar chart
        barChartSvg.append("text")
            .attr("x", 250)
            .attr("y", 16)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text(country.countryName);

        // Prepare data for bar chart
        const barChartData = emissionsData.filter(d => d.country_code === country.countryCode).map(d => ({
            year: d.year,
            value: d.value
        }));

        // Set up scales and axes for the bar chart
        const xScale = d3.scaleBand()
            .domain(barChartData.map(d => d.year))
            .range([100, 400])
            .padding(0.1);

        const years = barChartData.map(d => d.year);
        const xAxis = d3.axisBottom(xScale)
            .tickValues(years.filter((d, i) => i % 10 === 0 || i === years.length - 1));

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(barChartData, d => d.value)])
            .nice()
            .range([200, 50]);

        const yAxis = d3.axisLeft(yScale);

        // Draw bars
        barChartSvg.selectAll(".bar")
            .data(barChartData)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => xScale(d.year))
            .attr("y", d => yScale(d.value))
            .attr("width", xScale.bandwidth())
            .attr("height", d => 200 - yScale(d.value))
            .attr("fill", "steelblue");

        // Add x-axis
        barChartSvg.append("g")
            .attr("class", "x-axis")
            .attr("transform", "translate(0,200)")
            .call(xAxis)
            .selectAll("text")
            .attr("dy", ".35em")
            .style("text-anchor", "end");

        // Add y-axis
        barChartSvg.append("g")
            .attr("class", "y-axis")
            .attr("transform", "translate(100,0)")
            .call(yAxis);

        // Rotate x-axis labels vertically
        barChartSvg.selectAll(".x-axis text")
            .attr("transform", "rotate(-90)")
            .attr("x", -10)
            .attr("y", 0)
            .attr("dy", ".35em")
            .style("text-anchor", "end");
    });

    // Create pie chart if both countries are selected
    if (selectedCountries.length === 2) {
        const selectedYear = +yearSlider.property("value");
        updatePieCharts(selectedYear);
    }
}

function updatePieCharts(selectedYear) {
    const pieData = selectedCountries.map(country => {
        const data = emissionsData.find(d => d.country_code === country.countryCode && d.year === selectedYear);
        return { countryName: country.countryName, value: data ? data.value : 0 };
    });
    d3.selectAll("#pie-chart").remove();

    const pieChartSvg = d3.select("#map").append("svg")
        .attr("id", "pie-chart")
        .attr("width", 500)
        .attr("height", 300)
        .style("position", "absolute")
        .style("top", `${height + 200}px`)
        .style("left", "1000px");

    const pie = d3.pie().value(d => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(100);

    const pieGroup = pieChartSvg.append("g")
        .attr("transform", "translate(150, 150)");

    pieGroup.selectAll("path")
        .data(pie(pieData))
        .enter().append("path")
        .attr("d", arc)
        .attr("fill", (d, i) => d3.schemeCategory10[i]);

    // Add legend next to the pie chart
    const legend = pieChartSvg.append("g")
        .attr("transform", "translate(220, 20)");

    let sum = pieData[0].value + pieData[1].value;

    pieData.forEach((d, i) => {
        const legendRow = legend.append("g")
            .attr("transform", `translate(0, ${i * 20})`)
            .attr("class", "pie-legend");

        legendRow.append("rect")
            .attr("width", 10)
            .attr("width", 10)
            .attr("fill", d3.schemeCategory10[i]);

        legendRow.append("text")
            .attr("x", 20)
            .attr("y", 10)
            .attr("letter-spacing", 0.8)
            .attr("text-anchor", "start")
            .text(`${d.countryName} (${(d.value / sum * 100).toFixed(2)}%)`);
    });

    const worldData = emissionsData.find(d => d.country_code === "WLD" && d.year === selectedYear);
    const country1 = emissionsData.find(d => d.country_code === selectedCountries[0].countryCode && d.year === selectedYear);
    const pieData1 = [
        { countryName: country1.country_name, value: country1.value ? country1.value : 0 },
        { countryName: worldData.country_name, value: worldData.value ? worldData.value : 0 }
    ];

    const pieChartSvg1 = d3.select("#map").append("svg")
        .attr("id", "pie-chart")
        .attr("width", 500)
        .attr("height", 300)
        .style("position", "absolute")
        .style("top", `${height + 500}px`)
        .style("left", "50px");

    const pie1 = d3.pie().value(d => d.value);
    const arc1 = d3.arc().innerRadius(0).outerRadius(100);

    const pieGroup1 = pieChartSvg1.append("g")
        .attr("transform", "translate(150, 150)");

    pieGroup1.selectAll("path")
        .data(pie1(pieData1))
        .enter().append("path")
        .attr("d", arc1)
        .attr("fill", (d, i) => d3.schemeCategory10[i]);

    // Add legend next to the pie chart
    const legend1 = pieChartSvg1.append("g")
        .attr("transform", "translate(220, 20)");

    let sum1 = pieData1[0].value + pieData1[1].value;

    pieData1.forEach((d, i) => {
        const legendRow = legend1.append("g")
            .attr("transform", `translate(0, ${i * 20})`)
            .attr("class", "pie-legend");

        legendRow.append("rect")
            .attr("width", 10)
            .attr("width", 10)
            .attr("fill", d3.schemeCategory10[i]);

        legendRow.append("text")
            .attr("x", 20)
            .attr("y", 10)
            .attr("letter-spacing", 0.8)
            .attr("text-anchor", "start")
            .text(`${d.countryName} (${(d.value / sum1 * 100).toFixed(2)}%)`);
    });

    const country2 = emissionsData.find(d => d.country_code === selectedCountries[1].countryCode && d.year === selectedYear);
    const pieData2 = [
        { countryName: country2.country_name, value: country2.value ? country2.value : 0 },
        { countryName: worldData.country_name, value: worldData.value ? worldData.value : 0 }
    ];

    const pieChartSvg2 = d3.select("#map").append("svg")
        .attr("id", "pie-chart")
        .attr("width", 500)
        .attr("height", 300)
        .style("position", "absolute")
        .style("top", `${height + 500}px`)
        .style("left", "550px");

    const pie2 = d3.pie().value(d => d.value);
    const arc2 = d3.arc().innerRadius(0).outerRadius(100);

    const pieGroup2 = pieChartSvg2.append("g")
        .attr("transform", "translate(150, 150)");

    pieGroup2.selectAll("path")
        .data(pie2(pieData2))
        .enter().append("path")
        .attr("d", arc2)
        .attr("fill", (d, i) => d3.schemeCategory10[i]);

    // Add legend next to the pie chart
    const legend2 = pieChartSvg2.append("g")
        .attr("transform", "translate(220, 20)");

    let sum2 = pieData2[0].value + pieData2[1].value;

    pieData2.forEach((d, i) => {
        const legendRow = legend2.append("g")
            .attr("transform", `translate(0, ${i * 20})`)
            .attr("class", "pie-legend");

        legendRow.append("rect")
            .attr("width", 10)
            .attr("width", 10)
            .attr("fill", d3.schemeCategory10[i]);

        legendRow.append("text")
            .attr("x", 20)
            .attr("y", 10)
            .attr("letter-spacing", 0.8)
            .attr("text-anchor", "start")
            .text(`${d.countryName} (${(d.value / sum2 * 100).toFixed(2)}%)`);
    });
}
