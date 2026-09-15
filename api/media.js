import crypto from "crypto";

const SESSION_COOKIE = "rg_admin_session";
const SESSION_HOURS = 8;

function json(res, status, data) {
  return res.status(status).json(data);
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";

  const part = cookie
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(name + "="));

  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function signSession(username, timestamp) {
  const secret = process.env.ADMIN_SESSION_SECRET;

  return crypto
    .createHmac("sha256", secret)
    .update(`${username}.${timestamp}`)
    .digest("hex");
}

function createSession(username) {
  const timestamp = Date.now().toString();
  const signature = signSession(username, timestamp);

  return Buffer
    .from(`${username}.${timestamp}.${signature}`)
    .toString("base64url");
}

function verifySession(req) {
  try {
    const session = getCookie(req, SESSION_COOKIE);

    if (!session) return false;

    const decoded = Buffer
      .from(session, "base64url")
      .toString("utf8");

    const parts = decoded.split(".");

    if (parts.length !== 3) return false;

    const [username, timestamp, signature] = parts;

    const age = Date.now() - Number(timestamp);

    if (!Number.isFinite(age)) return false;

    if (age > SESSION_HOURS * 60 * 60 * 1000) {
      return false;
    }

    const expected = signSession(username, timestamp);

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

function setSessionCookie(res, username) {
  const session = createSession(username);

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 60 * 60}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function allowedPath(path) {
  if (typeof path !== "string") return false;

  const allowedPrefixes = [
    "assets/images/baby/",
    "assets/images/maternity/",
    "assets/images/pre-wedding/",
    "assets/images/post-wedding/",
    "assets/images/weddings/",
    "assets/images/main-"
  ];

  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
  ];

  const prefixOK = allowedPrefixes.some(prefix =>
    path.startsWith(prefix)
  );

  const extensionOK = allowedExtensions.some(ext =>
    path.toLowerCase().endsWith(ext)
  );

  return prefixOK && extensionOK;
}

async function githubGet(path) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const response = await fetch(url, {
    headers: githubHeaders()
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `GitHub request failed: ${response.status}`
    );
  }

  return data;
}

async function githubUpdate(path, content, message) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  const current = await githubGet(path);

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify({
      message,
      content,
      branch,
      sha: current.sha
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `GitHub update failed: ${response.status}`
    );
  }

  return data;
}

async function githubDelete(path, message) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  const current = await githubGet(path);

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: githubHeaders(),
    body: JSON.stringify({
      message,
      branch,
      sha: current.sha
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `GitHub delete failed: ${response.status}`
    );
  }

  return data;
}

export default async function handler(req, res) {
  try {
    const {
      GITHUB_TOKEN,
      GITHUB_OWNER,
      GITHUB_REPO,
      ADMIN_USER,
      ADMIN_PASSWORD,
      ADMIN_SESSION_SECRET
    } = process.env;

    if (
      !GITHUB_TOKEN ||
      !GITHUB_OWNER ||
      !GITHUB_REPO ||
      !ADMIN_USER ||
      !ADMIN_PASSWORD ||
      !ADMIN_SESSION_SECRET
    ) {
      return json(res, 500, {
        ok: false,
        error: "Required Vercel environment variables are not configured."
      });
    }

    const action = req.body?.action;

    /*
     * LOGIN
     */
    if (req.method === "POST" && action === "login") {
      const username = String(req.body?.username || "");
      const password = String(req.body?.password || "");

      if (
        username !== ADMIN_USER ||
        password !== ADMIN_PASSWORD
      ) {
        return json(res, 401, {
          ok: false,
          error: "Invalid username or password."
        });
      }

      setSessionCookie(res, username);

      return json(res, 200, {
        ok: true,
        authenticated: true
      });
    }

    /*
     * LOGOUT
     */
    if (req.method === "POST" && action === "logout") {
      clearSessionCookie(res);

      return json(res, 200, {
        ok: true
      });
    }

    /*
     * CHECK SESSION / API STATUS
     */
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        connected: true,
        authenticated: verifySession(req),
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        branch: process.env.GITHUB_BRANCH || "main"
      });
    }

    /*
     * ALL WRITE ACTIONS REQUIRE LOGIN
     */
    if (!verifySession(req)) {
      return json(res, 401, {
        ok: false,
        error: "Admin session expired or not authenticated."
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        error: "Method not allowed."
      });
    }

    const path = req.body?.path;

    if (!allowedPath(path)) {
      return json(res, 400, {
        ok: false,
        error: "This file path is not allowed."
      });
    }

    /*
     * REPLACE IMAGE
     */
    if (action === "replace") {
      const content = String(req.body?.content || "");

      if (!content) {
        return json(res, 400, {
          ok: false,
          error: "Missing file content."
        });
      }

      const result = await githubUpdate(
        path,
        content,
        `Admin: replace ${path}`
      );

      return json(res, 200, {
        ok: true,
        action: "replace",
        path,
        commit: result.commit?.sha || null
      });
    }

    /*
     * REMOVE IMAGE
     */
    if (action === "remove") {
      const result = await githubDelete(
        path,
        `Admin: remove ${path}`
      );

      return json(res, 200, {
        ok: true,
        action: "remove",
        path,
        commit: result.commit?.sha || null
      });
    }

    return json(res, 400, {
      ok: false,
      error: "Unknown action."
    });

  } catch (error) {
    console.error(error);

    return json(res, 500, {
      ok: false,
      error: error?.message || "Server error."
    });
  }
}
