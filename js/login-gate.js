(function(){
  "use strict";
  const protectedPages = new Set(["players.html","teams.html","fixtures.html","results.html"]);
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (!protectedPages.has(page)) return;

  const main = document.querySelector("main");
  if (!main) return;

  const originalChildren = Array.from(main.children);
  const gate = document.createElement("section");
  gate.id = "loginRequiredNotice";
  gate.className = "card";
  gate.style.cssText = "max-width:760px;margin:42px auto;padding:30px;text-align:center;border-radius:16px";
  gate.innerHTML = '<div style="font-size:34px;margin-bottom:10px" aria-hidden="true">🔒</div>' +
    '<h1 style="margin:0 0 12px">Login Required</h1>' +
    '<p style="margin:0 auto 20px;line-height:1.7">Please login with your Google account to see the content on this page. Meanwhile, you can join the WhatsApp group for more information.</p>' +
    '<div style="display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap">' +
    '<button type="button" class="primary" id="loginToViewContent">Login with Google</button>' +
    '<a href="https://chat.whatsapp.com/CTL9t7xGjz80LWU1Sp2hH8?s=cl&p=i&mlu=4" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:9px;background:#128c4a;color:#fff;text-decoration:none;font-weight:800">🟢 Join WhatsApp Group</a>' +
    '</div>';
  const style = document.createElement("style");
  style.textContent = "body.srgf-login-gate-pending main{visibility:hidden}#loginRequiredNotice{color:var(--text,#eaf2ff)}";
  document.head.appendChild(style);
  document.body.classList.add("srgf-login-gate-pending");
  main.prepend(gate);

  document.getElementById("loginToViewContent").addEventListener("click", function(){
    window.SRGFAuth?.login?.();
  });

  function updateGate(){
    const loggedIn = !!window.SRGFAuth?.token?.();
    originalChildren.forEach(el => { el.hidden = !loggedIn; });
    gate.hidden = loggedIn;
    document.body.classList.remove("srgf-login-gate-pending");
  }

  window.addEventListener("srgf-auth-change", updateGate);
  // Restore a valid saved session before deciding whether to reveal page content.
  Promise.resolve(window.SRGFAuth?.init?.()).finally(updateGate);
  updateGate();
})();