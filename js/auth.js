(() => {
  const C=window.SRGF_CONFIG;
  let session={role:"USER",email:"",token:""};

  function readStored(){
    try { return JSON.parse(localStorage.getItem("SRGF_AUTH")||"null")||{}; } catch(_){ return {}; }
  }
  function save(){ try{localStorage.setItem("SRGF_AUTH",JSON.stringify(session));}catch(_){} }
  function clear(){
    session={role:"USER",email:"",token:""};
    try{localStorage.removeItem("SRGF_AUTH")}catch(_){}
    try{window.google?.accounts?.id?.disableAutoSelect()}catch(_){}
    render();
  }
  function role(){return String(session.role||"USER").toUpperCase();}
  function canAuction(){return role()==="ADMIN";}
  function canEditFixtures(){return role()==="ADMIN"||role()==="WRITER";}

  function loadGoogleIdentityServices(){
    return new Promise((resolve,reject)=>{
      if(window.google?.accounts?.id){resolve();return;}
      const existing=document.querySelector('script[data-srgf-google-gis="1"]');
      if(existing){
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",()=>reject(new Error("Google Sign-In could not be loaded.")),{once:true});
        return;
      }
      const script=document.createElement("script");
      script.src="https://accounts.google.com/gsi/client";
      script.async=true;
      script.defer=true;
      script.dataset.srgfGoogleGis="1";
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error("Google Sign-In could not be loaded."));
      document.head.appendChild(script);
    });
  }

  async function verifyToken(token){
    const j=await window.SRGF.live("whoami",token);
    session={role:String(j.role||"USER").toUpperCase(),email:j.email||"",token};
    save(); render(); return session;
  }

  function render(){
    const box=document.getElementById("authBox");
    if(box){
      if(session.token){
        box.innerHTML=`<span class="role-pill">${window.SRGF.esc(session.role)} · ${window.SRGF.esc(session.email)}</span><button class="secondary" id="logoutBtn">Logout</button>`;
        document.getElementById("logoutBtn")?.addEventListener("click",clear);
      }else{
        box.innerHTML=`<button class="secondary" id="loginBtn">Admin / Writer Login</button>`;
        document.getElementById("loginBtn")?.addEventListener("click",startLogin);
      }
    }

    // Rebuild navigation after login/logout so Auction is visible only to Admin.
    const currentPage=document.body?.dataset?.page||"";
    if(window.SRGF?.nav) window.SRGF.nav(currentPage);
    document.body?.classList.toggle("is-admin",canAuction());
    document.body?.classList.toggle("is-writer",canEditFixtures()&&!canAuction());
  }

  async function startLogin(){
    try{
      if(!C?.GOOGLE_CLIENT_ID || C.GOOGLE_CLIENT_ID.includes("PASTE_")){
        throw new Error("Google login is not configured yet.");
      }
      await loadGoogleIdentityServices();
      window.google.accounts.id.initialize({
        client_id:C.GOOGLE_CLIENT_ID,
        callback:async response=>{
          try{
            if(!response?.credential) throw new Error("Google did not return a login credential.");
            await verifyToken(response.credential);
          }catch(e){
            alert("Login was not authorized: "+(e.message||e));
            clear();
          }
        }
      });
      window.google.accounts.id.prompt();
    }catch(e){
      alert(e.message||String(e));
    }
  }

  async function init(){
    render();
    const s=readStored();
    if(!s.token)return;
    try{
      await verifyToken(s.token);
    }catch(_){
      clear();
    }
  }

  window.SRGFAuth={init,role,canAuction,canEditFixtures,token:()=>session.token,email:()=>session.email,clear};
})();
