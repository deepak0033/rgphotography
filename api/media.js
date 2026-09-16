export default async function handler(req, res) {
  const {
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_BRANCH,
    ADMIN_USER,
    ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET
  } = process.env;

  const branch = GITHUB_BRANCH || "main";

  /* =========================================================
     BASIC RESPONSE HELPERS
  ========================================================= */

  function json(status, data) {
    res.status(status).json(data);
  }

  function getBody() {
    return req.body || {};
  }

  /* =========================================================
     ENVIRONMENT CHECK
  ========================================================= */

  function githubConfigured() {
    return Boolean(
      GITHUB_TOKEN &&
      GITHUB_OWNER &&
      GITHUB_REPO
    );
  }

  /* =========================================================
     ALLOWED MEDIA PATHS
  ========================================================= */

  const allowedPrefixes = [
    "assets/images/baby/",
    "assets/images/maternity/",
    "assets/images/pre-wedding/",
    "assets/images/post-wedding/",
    "assets/images/weddings/",
    "assets/videos/"
  ];

  const allowedExactFiles = [
    "assets/images/main-1.jpg",
    "assets/images/main-2.jpg",
    "assets/images/main-3.jpg"
  ];

  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".mp4",
    ".webm",
    ".mov"
  ];

  function isAllowedPath(filePath) {
    if (typeof filePath !== "string") {
      return false;
    }

    if (filePath.includes("..")) {
      return false;
    }

    if (filePath.startsWith("/")) {
      return false;
    }

    const exactAllowed =
      allowedExactFiles.includes(filePath);

    const prefixAllowed =
      allowedPrefixes.some(prefix =>
        filePath.startsWith(prefix)
      );

    const extensionAllowed =
      allowedExtensions.some(ext =>
        filePath.toLowerCase().endsWith(ext)
      );

    return (
      (exactAllowed || prefixAllowed) &&
      extensionAllowed
    );
  }

  /* =========================================================
     GITHUB HEADERS
  ========================================================= */

  function githubHeaders() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json"
    };
  }

  function githubUrl(path = "") {
    const encodedPath = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    let url =
      `https://api.github.com/repos/` +
      `${encodeURIComponent(GITHUB_OWNER)}/` +
      `${encodeURIComponent(GITHUB_REPO)}/contents`;

    if (path) {
      url += `/${encodedPath}`;
    }

    return (
      url +
      `?ref=${encodeURIComponent(branch)}`
    );
  }

  /* =========================================================
     GITHUB GET FILE
  ========================================================= */

  async function getGitHubFile(path) {
    const response = await fetch(
      githubUrl(path),
      {
        method: "GET",
        headers: githubHeaders()
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        `GitHub request failed: ${response.status}`
      );
    }

    return data;
  }

  /* =========================================================
     GITHUB LIST DIRECTORY
  ========================================================= */

  async function listDirectory(path) {
    const response = await fetch(
      githubUrl(path),
      {
        method: "GET",
        headers: githubHeaders()
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        `GitHub directory request failed: ${response.status}`
      );
    }

    return Array.isArray(data) ? data : [];
  }

  /* =========================================================
     RECURSIVE DIRECTORY WALK
  ========================================================= */

  async function collectFiles(path) {
    const entries = await listDirectory(path);

    const results = [];

    for (const entry of entries) {
      if (entry.type === "file") {
        const filePath = entry.path;

        if (
          isAllowedPath(filePath)
        ) {
          results.push({
            path: filePath,
            name: entry.name,
            type: "file",
            size: entry.size || 0,
            sha: entry.sha || null,
            download_url:
              entry.download_url || null
          });
        }
      }

      if (entry.type === "dir") {
        const nested = await collectFiles(
          entry.path
        );

        results.push(...nested);
      }
    }

    return results;
  }

  /* =========================================================
     GITHUB CREATE / REPLACE FILE
  ========================================================= */

  async function putGitHubFile({
    path,
    contentBase64,
    message,
    sha
  }) {
    const encodedPath = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const url =
      `https://api.github.com/repos/` +
      `${encodeURIComponent(GITHUB_OWNER)}/` +
      `${encodeURIComponent(GITHUB_REPO)}/contents/` +
      `${encodedPath}`;

    const payload = {
      message:
        message ||
        `Admin update: ${path}`,
      content: contentBase64,
      branch
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await fetch(
      url,
      {
        method: "PUT",
        headers: githubHeaders(),
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        `GitHub upload failed: ${response.status}`
      );
    }

    return data;
  }

  /* =========================================================
     GITHUB DELETE FILE
  ========================================================= */

  async function deleteGitHubFile({
    path,
    sha,
    message
  }) {
    const encodedPath = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const url =
      `https://api.github.com/repos/` +
      `${encodeURIComponent(GITHUB_OWNER)}/` +
      `${encodeURIComponent(GITHUB_REPO)}/contents/` +
      `${encodedPath}`;

    const payload = {
      message:
        message ||
        `Admin remove: ${path}`,
      sha,
      branch
    };

    const response = await fetch(
      url,
      {
        method: "DELETE",
        headers: githubHeaders(),
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        `GitHub delete failed: ${response.status}`
      );
    }

    return data;
  }

  /* =========================================================
     BASE64 VALIDATION
  ========================================================= */

  function cleanBase64(value) {
    if (typeof value !== "string") {
      return null;
    }

    /*
      Supports:
      data:image/jpeg;base64,AAAA...
      OR
      plain Base64
    */

    if (value.includes(",")) {
      value =
        value.substring(
          value.indexOf(",") + 1
        );
    }

    value = value.replace(/\s/g, "");

    return value || null;
  }

  /* =========================================================
     OPTIONAL ADMIN SESSION
     ========================================================= */

  /*
    This API supports ADMIN_USER / ADMIN_PASSWORD.
    The browser-side admin portal can later use the
    login action to receive a session cookie.
  */

  function base64UrlEncode(buffer) {
    return Buffer.from(buffer)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function base64UrlDecode(value) {
    let str = value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    while (str.length % 4) {
      str += "=";
    }

    return Buffer.from(str, "base64");
  }

  async function hmacSha256(value) {
    const crypto =
      await import("node:crypto");

    return crypto
      .createHmac(
        "sha256",
        ADMIN_SESSION_SECRET
      )
      .update(value)
      .digest();
  }

  async function createSession(username) {
    if (!ADMIN_SESSION_SECRET) {
      return null;
    }

    const now =
      Math.floor(Date.now() / 1000);

    const payload = {
      user: username,
      iat: now,
      exp: now + 60 * 60 * 12
    };

    const encodedPayload =
      base64UrlEncode(
        JSON.stringify(payload)
      );

    const signature =
      base64UrlEncode(
        await hmacSha256(
          encodedPayload
        )
      );

    return `${encodedPayload}.${signature}`;
  }

  async function verifySession(req) {
    if (!ADMIN_SESSION_SECRET) {
      return false;
    }

    const cookieHeader =
      req.headers.cookie || "";

    const match =
      cookieHeader.match(
        /rj_admin_session=([^;]+)/
      );

    if (!match) {
      return false;
    }

    const token = match[1];

    const parts =
      token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const [
      encodedPayload,
      suppliedSignature
    ] = parts;

    const expectedSignature =
      base64UrlEncode(
        await hmacSha256(
          encodedPayload
        )
      );

    if (
      suppliedSignature !==
      expectedSignature
    ) {
      return false;
    }

    try {
      const payload =
        JSON.parse(
          base64UrlDecode(
            encodedPayload
          ).toString("utf8")
        );

      if (
        !payload.exp ||
        payload.exp <
          Math.floor(Date.now() / 1000)
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     METHODS
  ========================================================= */

  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Origin",
      req.headers.origin || "*"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS"
    );

    return res.status(204).end();
  }

  /* =========================================================
     GET
  ========================================================= */

  if (req.method === "GET") {
    if (!githubConfigured()) {
      return json(500, {
        ok: false,
        connected: false,
        error:
          "GitHub environment variables are not configured."
      });
    }

    try {
      /*
        Simple health check:
        /api/media
      */

      if (!req.query || !req.query.action) {
        return json(200, {
          ok: true,
          connected: true,
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          branch,
          api: "RJ Photography Media API"
        });
      }

      /*
        List all managed media:
        /api/media?action=list
      */

      if (
        req.query.action === "list"
      ) {
        const files = [];

        const roots = [
          "assets/images/baby",
          "assets/images/maternity",
          "assets/images/pre-wedding",
          "assets/images/post-wedding",
          "assets/images/weddings",
          "assets/videos"
        ];

        for (const root of roots) {
          try {
            const nested =
              await collectFiles(root);

            files.push(...nested);
          } catch (error) {
            console.warn(
              `Could not read ${root}:`,
              error.message
            );
          }
        }

        /*
          Main image files
        */

        for (const mainFile of allowedExactFiles) {
          try {
            const file =
              await getGitHubFile(
                mainFile
              );

            files.push({
              path: mainFile,
              name:
                mainFile.split("/").pop(),
              type: "file",
              size:
                file.size || 0,
              sha:
                file.sha || null,
              download_url:
                file.download_url || null
            });
          } catch {
            /*
              Ignore missing main files
            */
          }
        }

        return json(200, {
          ok: true,
          branch,
          count: files.length,
          files
        });
      }

      return json(400, {
        ok: false,
        error:
          "Unknown GET action."
      });

    } catch (error) {
      return json(500, {
        ok: false,
        error:
          error.message ||
          "Server error."
      });
    }
  }

  /* =========================================================
     POST
  ========================================================= */

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );

    return json(405, {
      ok: false,
      error:
        "Method not allowed."
    });
  }

  const body = getBody();

  /* =========================================================
     LOGIN
  ========================================================= */

  if (body.action === "login") {
    if (
      !ADMIN_USER ||
      !ADMIN_PASSWORD ||
      !ADMIN_SESSION_SECRET
    ) {
      return json(500, {
        ok: false,
        error:
          "Admin environment variables are not configured."
      });
    }

    const username =
      String(body.username || "");

    const password =
      String(body.password || "");

    if (
      username !== ADMIN_USER ||
      password !== ADMIN_PASSWORD
    ) {
      return json(401, {
        ok: false,
        error:
          "Incorrect User ID or Password."
      });
    }

    const session =
      await createSession(
        username
      );

    res.setHeader(
      "Set-Cookie",
      `rj_admin_session=${session}; ` +
      `Path=/; ` +
      `HttpOnly; ` +
      `Secure; ` +
      `SameSite=Lax; ` +
      `Max-Age=43200`
    );

    return json(200, {
      ok: true,
      authenticated: true
    });
  }

  /* =========================================================
     LOGOUT
  ========================================================= */

  if (body.action === "logout") {
    res.setHeader(
      "Set-Cookie",
      "rj_admin_session=; " +
      "Path=/; " +
      "HttpOnly; " +
      "Secure; " +
      "SameSite=Lax; " +
      "Max-Age=0"
    );

    return json(200, {
      ok: true,
      authenticated: false
    });
  }

  /* =========================================================
     SESSION CHECK
  ========================================================= */

  if (body.action === "session") {
    const authenticated =
      await verifySession(req);

    return json(200, {
      ok: true,
      authenticated
    });
  }

  /* =========================================================
     GITHUB CONFIG CHECK
  ========================================================= */

  if (!githubConfigured()) {
    return json(500, {
      ok: false,
      error:
        "GitHub environment variables are not configured."
    });
  }

  /* =========================================================
     REQUIRE ADMIN SESSION FOR MEDIA CHANGES
  ========================================================= */

  const authenticated =
    await verifySession(req);

  if (!authenticated) {
    return json(401, {
      ok: false,
      error:
        "Admin authentication required."
    });
  }

  /* =========================================================
     VALIDATE ACTION
  ========================================================= */

  const action =
    String(body.action || "");

  const filePath =
    body.path;

  if (
    !filePath ||
    !isAllowedPath(filePath)
  ) {
    return json(400, {
      ok: false,
      error:
        "Invalid or disallowed media path.",
      path: filePath
    });
  }

  /* =========================================================
     REPLACE / UPLOAD
  ========================================================= */

  if (
    action === "replace" ||
    action === "upload"
  ) {
    const content =
      cleanBase64(
        body.content
      );

    if (!content) {
      return json(400, {
        ok: false,
        error:
          "Base64 file content is required."
      });
    }

    let existing;

    try {
      existing =
        await getGitHubFile(
          filePath
        );
    } catch {
      existing = null;
    }

    const result =
      await putGitHubFile({
        path: filePath,
        contentBase64: content,
        sha:
          existing?.sha,
        message:
          body.message ||
          `Admin: ${action} ${filePath}`
      });

    return json(200, {
      ok: true,
      action,
      path: filePath,
      branch,
      commit:
        result.commit?.sha ||
        null,
      github_path:
        result.content?.path ||
        filePath
    });
  }

  /* =========================================================
     REMOVE
  ========================================================= */

  if (action === "remove") {
    let existing;

    try {
      existing =
        await getGitHubFile(
          filePath
        );
    } catch {
      return json(404, {
        ok: false,
        error:
          "File not found in GitHub.",
        path: filePath
      });
    }

    if (!existing.sha) {
      return json(500, {
        ok: false,
        error:
          "GitHub file SHA could not be determined."
      });
    }

    const result =
      await deleteGitHubFile({
        path: filePath,
        sha: existing.sha,
        message:
          body.message ||
          `Admin: remove ${filePath}`
      });

    return json(200, {
      ok: true,
      action: "remove",
      path: filePath,
      branch,
      commit:
        result.commit?.sha ||
        null
    });
  }

  /* =========================================================
     UNKNOWN ACTION
  ========================================================= */

  return json(400, {
    ok: false,
    error:
      `Unknown action: ${action}`
  });
}
