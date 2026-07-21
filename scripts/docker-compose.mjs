/**
 * Run docker compose / docker-compose against this project's compose file.
 * Homebrew Colima installs the standalone `docker-compose` binary, not always `docker compose`.
 */
import { accessSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

let cachedRunner = null;

function commandExists(name) {
  const result = spawnSync("which", [name], { stdio: "ignore" });
  return result.status === 0;
}

function dockerComposePluginWorks() {
  const result = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
    env: process.env,
  });
  return result.status === 0;
}

function resolveDockerHost() {
  if (process.env.DOCKER_HOST?.trim()) {
    return process.env.DOCKER_HOST.trim();
  }

  const context = spawnSync(
    "docker",
    ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    { encoding: "utf8", env: process.env }
  );
  const host = context.stdout?.trim();
  return host || undefined;
}

function dockerEnvForComposeFile(composeFile) {
  const projectRoot = path.dirname(composeFile);
  const configDir = path.join(projectRoot, ".local", "docker");
  mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, "config.json");

  /** @type {Record<string, unknown>} */
  let config = {};
  try {
    const user = JSON.parse(readFileSync(path.join(homedir(), ".docker", "config.json"), "utf8"));
    if (user.currentContext) config.currentContext = user.currentContext;
    if (user.auths) config.auths = user.auths;
  } catch {
    config.currentContext = "colima";
  }

  try {
    accessSync(configPath);
  } catch {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }

  const env = { ...process.env, DOCKER_CONFIG: configDir };
  const dockerHost = resolveDockerHost();
  if (dockerHost) env.DOCKER_HOST = dockerHost;
  return env;
}

/** @returns {{ command: string, prefixArgs: string[] }} */
export function getDockerComposeRunner() {
  if (cachedRunner) return cachedRunner;

  if (dockerComposePluginWorks()) {
    cachedRunner = { command: "docker", prefixArgs: ["compose"] };
    return cachedRunner;
  }

  if (commandExists("docker-compose")) {
    cachedRunner = { command: "docker-compose", prefixArgs: [] };
    return cachedRunner;
  }

  throw new Error(
    [
      "Docker Compose not found.",
      "",
      "Install it with Homebrew:",
      "  brew install docker-compose",
      "",
      "Or enable the Docker Compose plugin if your Docker install supports it.",
    ].join("\n")
  );
}

export function runDockerCompose(composeFile, args, { cwd, stdio = "inherit" } = {}) {
  const runner = getDockerComposeRunner();
  const fullArgs = [...runner.prefixArgs, "-f", composeFile, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(runner.command, fullArgs, {
      cwd,
      stdio,
      env: dockerEnvForComposeFile(composeFile),
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else {
        const label =
          runner.command === "docker"
            ? `docker compose ${args.join(" ")}`
            : `docker-compose ${args.join(" ")}`;
        reject(new Error(`${label} failed (${code})`));
      }
    });
  });
}

export function runDockerComposeSync(composeFile, args, { cwd, stdio = "pipe" } = {}) {
  const runner = getDockerComposeRunner();
  const fullArgs = [...runner.prefixArgs, "-f", composeFile, ...args];
  return spawnSync(runner.command, fullArgs, {
    cwd,
    stdio,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    env: dockerEnvForComposeFile(composeFile),
  });
}
