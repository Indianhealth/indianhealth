const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = form.username.value;
  const password = form.password.value;

  try {
    const res = await fetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      window.location.href = "/admin"; // redirect after successful login
    } else {
      alert("Login failed: " + data.message);
    }
  } catch (err) {
    console.error("Login error:", err);
    alert("Something went wrong!");
  }
});
