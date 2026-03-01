async function fetchCars() {
    const res = await fetch("https://unsplash.com/napi/search/photos?query=toyota+camry&per_page=5");
    const data = await res.json();
    const urls = data.results.map(r => r.urls.regular);
    console.log(urls);
}
fetchCars();
