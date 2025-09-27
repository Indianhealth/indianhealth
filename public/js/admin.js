let currentPage = 1, totalPages = 1;

async function fetchData(page=1) {
  try {
    const res = await fetch(`/admin/registrations?page=${page}`);
    if (!res.ok) {
      alert("Session expired. Please log in again.");
      window.location.href = "/admin/login";
      return;
    }
    const json = await res.json();
    const tbody = document.querySelector("#regTable tbody");
    tbody.innerHTML = "";
    if (json.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No registrations found</td></tr>`;
    }
    json.data.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.name}</td>
        <td>${r.phone}</td>
        <td>${r.email}</td>
        <td>${r.city||""}</td>
        <td>${r.address||""}</td>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
    currentPage = json.page;
    totalPages = json.pages;
    document.getElementById("pageInfo").innerText = `Page ${currentPage} of ${totalPages}`;
  } catch (err) {
    console.error(err);
    alert("Error loading data");
  }
}

document.getElementById("prevBtn").addEventListener("click", ()=> {
  if (currentPage > 1) fetchData(currentPage-1);
});

document.getElementById("nextBtn").addEventListener("click", ()=> {
  if (currentPage < totalPages) fetchData(currentPage+1);
});

document.getElementById("downloadCsv").addEventListener("click", async ()=> {
  const res = await fetch(`/admin/registrations?page=1&limit=9999`);
  if (!res.ok) {
    alert("Session expired. Please log in again.");
    window.location.href = "/admin/login";
    return;
  }
  const json = await res.json();
  let csv = "Name,Phone,Email,City,Address,Date\n";
  json.data.forEach(r=>{
    csv += `"${r.name}","${r.phone}","${r.email}","${r.city||""}","${r.address||""}","${new Date(r.createdAt).toISOString()}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "registrations.csv";
  link.click();
});

// Initial load
fetchData();
