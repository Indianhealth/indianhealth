const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault(); // prevent page reload

  const username = form.username.value;
  const password = form.password.value;

  try {
    const res = await fetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // ✅ important for session cookie
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      window.location.href = "/admin"; // correct dashboard route
    } else {
      alert("Login failed: " + (data.message || "Invalid credentials"));
    }
  } catch (err) {
    console.error("Login error:", err);
    alert("Something went wrong!");
  }
});
