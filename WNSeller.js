// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("show"));
    document.getElementById(tab).classList.add("show");
  });
});

// Form submit -> Netlify Function -> Telegram
const form = document.getElementById("orderForm");
const msg = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  submitBtn.disabled = true;

  try{
    const fd = new FormData(form);
    const res = await fetch("/.netlify/functions/sendOrder", {
      method: "POST",
      body: fd
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || "Send failed");
    msg.textContent = "✅ အော်ဒါတင်ပြီးပါပြီ။ Admin က Telegram မှာ လက်ခံစစ်ဆေးပါမယ်။";
    form.reset();
  }catch(err){
    msg.textContent = "❌ မအောင်မြင်ပါ။ " + err.message;
  }finally{
    submitBtn.disabled = false;
  }
});