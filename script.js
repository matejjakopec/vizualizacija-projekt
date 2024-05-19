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
const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", "translate(20, 120)");

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
    .text("11");

legend.append("text")
    .attr("class", "legend-text-max")
    .attr("x", legendWidth)
    .attr("y", legendHeight + 15)
    .attr("text-anchor", "end")
    .text("2890696.10");

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
            const emissionText = emission ? emission.toFixed(2) : "Data not available";
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
    });

    function updateMap(year) {
        const yearData = emissionsData.filter(d => d.year === year);

        countryEmissions = {};

        // Iterate over each data point
        yearData.forEach(d => {
            // For Soviet countries (excluding Russia) before 1990, use Russian data
            if (d.country_code === "RUS" && year < 1990) {
                // Iterate over each Soviet country
                ["ARM", "AZE", "BLR", "EST", "GEO", "KAZ", "KGZ", "LVA", "LTU", "MDA", "TKM", "TJK", "UKR", "UZB", "RUS", "DEU", "CZE", "SVK", "PLN"].forEach(sovietCountry => {
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
        legend.select(".legend-text-min").text(minEmission.toFixed(2));
        legend.select(".legend-text-max").text(maxEmission.toFixed(2));
    }

});

// Create a button to recentre the map
const recenterButton = svg.append("g")
    .attr("class", "recenter-button")
    .attr("transform", `translate(${width - 150}, ${height - 50})`);

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

