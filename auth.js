(() => {
  const C=window.SRGF_CONFIG;
  let session={role:"USER",email:"",token:""};

  function readStored(){
    try { return JSON.parse(localStorage.getItem("SRGF_AUTH")||"null")||{}; } catch(_){ return {}; }
  }
  function save(){ try{localStorage.setItem("SRGF_AUTH",JSON.stringify(session));}catch(_){} }
  function clear(){session={role:"USER",email:"",token:""};try{localStorage.removeItem("SRGF_AUTH")}catch(_){}; render();}
  function role(){return String(session.role||"USER").toUpperCase();}
  function canAuction(){return role()==="ADMIN";}
  function canEditFixtures(){return role()==="ADMIN"||role()==="WRITER";}

  async function verifyToken(token){
    const j=await window.SRGF.live("whoami",token);
    session={role:String(j.role||"USER").toUpperCase(),email:j.email||"",token};
    save(); render(); return session;
  }

  function render(){
    const box=document.getElementById("authBox");
    if(!box) return;
    if(session.token){
      box.innerHTML=`<span class="role-pill">${window.SRGF.esc(session.role)} · ${window.SRGF.esc(session.email)}</span><button class="secondary" id="logoutBtn">Logout</button>`;
      document.getElementById("logoutBtn")?.addEventListener("click",clear);
    }else{
      box.innerHTML=`<button class="secondary" id="loginBtn">Admin / Writer Login</button>`;
      document.getElementById("loginBtn")?.addEventListener("click",startLogin);
    }

    // Rebuild navigation after login/logout so Auction is visible only to Admin.
    const currentPage = document.body?.dataset?.page || "";
    if(window.SRGF?.nav) window.SRGF.nav(currentPage);
    document.body.classList.toggle("is-admin",canAuction());
    document.body.classList.toggle("is-writer",canEditFixtures()&&!canAuction());
  }

  function startLogin(){
    if(C.GOOGLE_CLIENT_ID.includes("PASTE_")){
      alert("Google login is not configured yet. Set GOOGLE_CLIENT_ID in js/config.js.");
      return;
    }
    if(!window.google?.accounts?.id){
      alert("Google Sign-In could not be loaded. Check the internet connection and OAuth client configuration.");
      return;
    }
    window.google.accounts.id.initialize({
      client_id:C.GOOGLE_CLIENT_ID,
      callback: async response => {
        try{ await verifyToken(response.credential); }
        catch(e){ alert("Login was not authorized: "+(e.message||e)); clear(); }
      }
    });
    window.google.accounts.id.prompt();
  }

  function init(){
    const s=readStored();
    if(s.token) session=s;
    render();
  }

  window.SRGFAuth={init,role,canAuction,canEditFixtures,token:()=>session.token,email:()=>session.email,clear};
})();