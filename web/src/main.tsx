import { render } from "preact";
import "@fontsource-variable/inter";
import "./styles/app.css";
import { App } from "./app.tsx";

render(<App />, document.getElementById("app")!);
