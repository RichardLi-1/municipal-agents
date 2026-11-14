import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setConcurrency(4);
Config.setOverwriteOutput(true);
// backdrop-filter (the frosted pills) needs a real compositor; ANGLE works headless on macOS.
Config.setChromiumOpenGlRenderer("angle");
