import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

import mainRoutes from "./src/routes/main.js";
import { requestLogger } from "./src/middlewares/requestLogger.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import logger from "./src/utils/logger.js";

declare const __dirname: string | undefined;

const currentDir =
    typeof __dirname !== "undefined"
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PKG_RUNTIME = Boolean(
    (process as NodeJS.Process & { pkg?: unknown }).pkg,
);
const SHOULD_AUTO_OPEN_BROWSER =
    process.env.AUTO_OPEN_BROWSER === "1" ||
    (IS_PKG_RUNTIME && process.env.DISABLE_AUTO_OPEN_BROWSER !== "1");
const executableDir = path.dirname(process.execPath);
const viewsDirCandidates = IS_PKG_RUNTIME
    ? [
          path.join(executableDir, "views"),
          path.join(executableDir, "dist", "views"),
          path.join(currentDir, "views"),
          path.join(currentDir, "dist", "views"),
      ]
    : [path.join(currentDir, "views"), path.join(currentDir, "dist", "views")];
const publicDirCandidates = IS_PKG_RUNTIME
    ? [
          path.join(executableDir, "public"),
          path.join(executableDir, "dist", "public"),
          path.join(currentDir, "public"),
          path.join(currentDir, "dist", "public"),
      ]
    : [
          path.join(currentDir, "public"),
          path.join(currentDir, "dist", "public"),
      ];
const viewsDir =
    viewsDirCandidates.find((dir) =>
        fs.existsSync(path.join(dir, "index.ejs")),
    ) ?? viewsDirCandidates[0];
const publicDir =
    publicDirCandidates.find((dir) =>
        fs.existsSync(path.join(dir, "css", "style.css")),
    ) ?? publicDirCandidates[0];

function openInDefaultBrowser(url: string): void {
    const platform = process.platform;

    if (platform === "win32") {
        spawn("cmd", ["/c", "start", "", url], {
            detached: true,
            stdio: "ignore",
        }).unref();
        return;
    }

    if (platform === "darwin") {
        spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
        return;
    }

    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

// View Engine
app.set("view engine", "ejs");
app.set("views", viewsDir);

// Middlewares
app.use(express.static(publicDir));
app.use(express.json());
app.use(requestLogger);

// Routes
app.use("/", mainRoutes);

// Error Handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    logger.info(`Server running on ${url}`);
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);

    if (SHOULD_AUTO_OPEN_BROWSER) {
        openInDefaultBrowser(url);
    }
});
