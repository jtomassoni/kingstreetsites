import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export type AgentDispatchResult = { ok: true } | { ok: false; error: string };

function shouldUseGitHubAgents(): boolean {
  return Boolean(process.env.VERCEL || process.env.USE_GITHUB_AGENTS === "1");
}

function githubRepo(): string {
  return process.env.GITHUB_REPOSITORY ?? "jtomassoni/kingstreetsites";
}

async function dispatchGitHubWorkflow(
  workflowFile: string,
  inputs: Record<string, string>
): Promise<AgentDispatchResult> {
  const token = process.env.GITHUB_AGENT_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      error:
        "Production workers run via GitHub Actions. Set GITHUB_AGENT_TOKEN on Vercel (fine-grained PAT with Actions: read/write on this repo). Also add DATABASE_URL and GOOGLE_PLACES_API_KEY as GitHub repo secrets.",
    };
  }

  const ref = process.env.GITHUB_AGENT_REF?.trim() || "main";
  const res = await fetch(
    `https://api.github.com/repos/${githubRepo()}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref, inputs }),
    }
  );

  if (res.status === 204) return { ok: true };

  const body = await res.text().catch(() => "");
  return {
    ok: false,
    error: `Could not start GitHub Actions worker (${res.status}). ${body.slice(0, 400)}`.trim(),
  };
}

function spawnPythonDetached(options: {
  scriptPath: string;
  args: string[];
  logPath: string;
  onError: (message: string) => void | Promise<void>;
}): AgentDispatchResult {
  const { scriptPath, args, logPath, onError } = options;
  let logFd: number | null = null;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logFd = fs.openSync(logPath, "a");
    fs.writeSync(logFd, `\n--- ${new Date().toISOString()} spawn ${scriptPath} ${args.join(" ")}\n`);
  } catch {
    logFd = null;
  }

  const child = spawn("python3", [scriptPath, ...args], {
    detached: true,
    stdio: logFd !== null ? (["ignore", logFd, logFd] as const) : "ignore",
    env: { ...process.env },
  });

  child.on("error", (err) => {
    if (logFd !== null) {
      try {
        fs.writeSync(logFd, `spawn error: ${err instanceof Error ? err.message : String(err)}\n`);
        fs.closeSync(logFd);
      } catch {
        /* ignore */
      }
      logFd = null;
    }
    void onError(`Could not start Python worker: ${err instanceof Error ? err.message : String(err)}`);
  });

  child.unref();
  if (logFd !== null) {
    try {
      fs.closeSync(logFd);
    } catch {
      /* ignore */
    }
  }

  return { ok: true };
}

export async function dispatchProspectorRun(params: {
  runId: string;
  zip: string;
  metro: string;
  onSpawnError: (message: string) => void | Promise<void>;
}): Promise<AgentDispatchResult> {
  if (shouldUseGitHubAgents()) {
    return dispatchGitHubWorkflow("agent-prospector.yml", {
      run_id: params.runId,
      zip: params.zip,
      metro: params.metro,
    });
  }

  return spawnPythonDetached({
    scriptPath: path.join(process.cwd(), "agents/prospector/main.py"),
    args: [params.zip, params.metro, params.runId],
    logPath: path.join(process.cwd(), "agents/prospector/worker.log"),
    onError: params.onSpawnError,
  });
}

export async function dispatchAnalyzerRun(params: {
  runId: string;
  limit: string;
  leadId?: string;
  onSpawnError: (message: string) => void | Promise<void>;
}): Promise<AgentDispatchResult> {
  if (shouldUseGitHubAgents()) {
    return dispatchGitHubWorkflow("agent-analyzer.yml", {
      run_id: params.runId,
      limit: params.limit,
      lead_id: params.leadId ?? "",
    });
  }

  const env = {
    ...process.env,
    ANALYZER_LIMIT: params.limit,
    ...(params.leadId ? { ANALYZER_LEAD_ID: params.leadId, ANALYZER_MAX_WORKERS: "1" } : {}),
  };

  const scriptPath = path.join(process.cwd(), "agents/analyzer/main.py");
  const logPath = path.join(process.cwd(), "agents/analyzer/worker.log");
  let logFd: number | null = null;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logFd = fs.openSync(logPath, "a");
    fs.writeSync(
      logFd,
      `\n--- ${new Date().toISOString()} analyzer runId=${params.runId} limit=${params.limit}\n`
    );
  } catch {
    logFd = null;
  }

  const child = spawn("python3", [scriptPath, params.runId, params.limit], {
    detached: true,
    stdio: logFd !== null ? (["ignore", logFd, logFd] as const) : "ignore",
    env,
  });

  child.on("error", (err) => {
    if (logFd !== null) {
      try {
        fs.writeSync(logFd, `spawn error: ${err instanceof Error ? err.message : String(err)}\n`);
        fs.closeSync(logFd);
      } catch {
        /* ignore */
      }
      logFd = null;
    }
    void params.onSpawnError(
      `Could not start Python worker: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  child.unref();
  if (logFd !== null) {
    try {
      fs.closeSync(logFd);
    } catch {
      /* ignore */
    }
  }

  return { ok: true };
}
