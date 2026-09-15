(function () {
  "use strict";

  const API = "/api/media";

  async function api(action, data = {}) {
    const response = await fetch(API, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        ...data
      })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error || `Request failed (${response.status})`
      );
    }

    return result;
  }

  /*
   * REAL ADMIN LOGIN
   */
  window.login = async function () {
    const username =
      document.getElementById("username").value.trim();

    const password =
      document.getElementById("password").value;

    const errorBox =
      document.getElementById("loginError");

    errorBox.textContent = "";

    try {
      await api("login", {
        username,
        password
      });

      sessionStorage.setItem("rgAdminLogin", "true");

      document.getElementById(
        "loginScreen"
      ).style.display = "none";

      document.getElementById(
        "adminApp"
      ).style.display = "block";

      if (typeof window.render === "function") {
        await window.render(true);
      }

    } catch (error) {
      errorBox.textContent =
        error.message || "Login failed.";
    }
  };

  /*
   * REAL LOGOUT
   */
  window.logout = async function () {
    try {
      await api("logout");
    } catch {}

    sessionStorage.removeItem("rgAdminLogin");
    location.reload();
  };

  /*
   * REAL GITHUB REPLACEMENT
   */
  window.processUpload = async function () {
    if (!window.uploadTarget) {
      window.showToast("No media slot selected.");
      return;
    }

    const input =
      document.getElementById("fileInput");

    if (!input.files.length) {
      window.showToast("Please select a file.");
      return;
    }

    const file = input.files[0];
    const path = window.uploadTarget;
    const requiredFilename =
      path.split("/").pop();

    /*
     * Keep exact filename
     */
    if (file.name !== requiredFilename) {
      alert(
        "Filename must remain exactly:\n\n" +
        requiredFilename +
        "\n\nSelected file:\n" +
        file.name
      );
      return;
    }

    /*
     * Browser → Base64
     */
    const reader = new FileReader();

    reader.onload = async function () {
      try {
        const dataUrl = reader.result;

        const base64 =
          String(dataUrl).split(",")[1];

        if (!base64) {
          throw new Error(
            "Unable to read selected file."
          );
        }

        window.showToast(
          "Publishing to GitHub..."
        );

        const result = await api("replace", {
          path,
          content: base64
        });

        /*
         * Remove old local preview
         */
        if (typeof window.clearPreview === "function") {
          try {
            await window.clearPreview(path);
          } catch {}
        }

        window.closeUpload();

        window.showToast(
          "Published successfully. Vercel will deploy the change."
        );

        setTimeout(() => {
          location.reload();
        }, 1500);

        return result;

      } catch (error) {
        console.error(error);

        window.showToast(
          error.message ||
          "GitHub publishing failed."
        );
      }
    };

    reader.readAsDataURL(file);
  };

  /*
   * Real remove function available to the portal.
   */
  window.removeLiveMedia = async function (path) {
    if (!path) return;

    const filename =
      path.split("/").pop();

    const confirmed = confirm(
      `Remove this file from the live GitHub website?\n\n${filename}`
    );

    if (!confirmed) return;

    try {
      window.showToast(
        "Removing from GitHub..."
      );

      await api("remove", {
        path
      });

      window.showToast(
        "Removed from GitHub. Vercel will deploy the change."
      );

      setTimeout(() => {
        location.reload();
      }, 1200);

    } catch (error) {
      window.showToast(
        error.message ||
        "Unable to remove file."
      );
    }
  };

})();
