const jsdom = require("jsdom");
const { JSDOM } = jsdom;

try {
  const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
  console.log(dom.window.document.querySelector("p").textContent);
  console.log("JSDOM is working");
} catch (e) {
  console.error("JSDOM failed:", e);
}
