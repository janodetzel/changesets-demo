/** A greeting. The one package in this demo that is published (to GitHub Packages). */
export function greet(name, { excited = false } = {}) {
  return `Hello, ${name}${excited ? "!!!" : "!"}`;
}
