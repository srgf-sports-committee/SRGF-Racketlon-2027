(() => {
  const C=window.SRGF_CONFIG;
  const SESSION_TTL=60*60*1000; // 60 minutes
  let session={role:"USER",email:"",token:"",loginAt:0,expiresAt:0};
  let expiryTimer=null;
  let lastActivityWrite=0;

  function readStored(){
    try { return JSON.parse(localStorage.getItem("SRGF_AUTH")||"null")||{}; } catch(_){ return {}; }
  }
  function save(){ try{localStorage.setItem("SRGF_AUTH",JSON.stringify(session));}catch(_){} }
  function armExpiryTimer(){
    if(expiryTimer) clearTimeout(expiryTimer);
    if(!session.token || !session.expiresAt) return;
    const delay=Math.max(0,Number(session.expiresAt)-Date.now());
    expiryTimer=setTimeout(()=>{
      if(session.token && Date.now() >= Number(session.expiresAt)){
        clear();
      }else{
        armExpiryTimer();
      }
    },delay+50);
  }

  function resetInactivityTimer(){
    if(!session.token) return;
    const now=Date.now();
    if(session.expiresAt && now >= Number(session.expiresAt)){
      clear();
      return;
    }
    session.expiresAt=now+SESSION_TTL;
    if(!session.loginAt) session.loginAt=now;
    // Avoid unnecessary localStorage writes during rapid typing/clicking.
    if(now-lastActivityWrite>=1000){
      save();
      lastActivityWrite=now;
    }
    armExpiryTimer();
  }

  function clear(){
    if(expiryTimer) clearTimeout(expiryTimer);
    expiryTimer=null;
    session={role:"USER",email:"",token:"",loginAt:0,expiresAt:0};
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
    const now=Date.now();
    session={role:String(j.role||"USER").toUpperCase(),email:j.email||"",token,loginAt:now,expiresAt:now+SESSION_TTL};
    lastActivityWrite=now;
    save(); render(); armExpiryTimer(); return session;
  }

  function initGoogleButton(){
    const holder=document.getElementById("googleSignInButton");
    if(!holder || !window.google?.accounts?.id)return;
    holder.innerHTML="";
    window.google.accounts.id.renderButton(holder,{
      type:"standard",
      theme:"outline",
      size:"large",
      text:"signin_with",
      shape:"rectangular",
      width:260,
      logo_alignment:"left"
    });
  }

  function showLoginError(message){
    const el=document.getElementById("srgfLoginError");
    if(el){
      el.textContent=message||"Login could not be started.";
      el.classList.remove("hidden");
    }else{
      alert(message||"Login could not be started.");
    }
  }

  function renderLoginPanel(){
    const box=document.getElementById("authBox");
    if(!box)return;
    box.innerHTML=`
      <div class="srgf-login-panel" id="srgfLoginPanel">
        <div class="srgf-login-title">Admin / Writer Login</div>
        <div class="srgf-login-help">Choose one of your Google accounts. If the account you need is not listed, Google provides an option to use another account and enter its email address.</div>
        <div id="googleSignInButton" class="srgf-google-button"></div>
        <button class="secondary srgf-login-cancel" id="srgfLoginCancel" type="button">Cancel</button>
        <div class="srgf-login-error hidden" id="srgfLoginError"></div>
        <div class="srgf-login-note">Google handles the password and security. This website only receives the Google sign-in credential and then checks the account against the ACCESS sheet.</div>
      </div>`;

    document.getElementById("srgfLoginCancel")?.addEventListener("click",render);
    setTimeout(initGoogleButton,0);
  }

  function render(){
    const box=document.getElementById("authBox");
    if(box){
      if(session.token){
        box.innerHTML=`<span class="role-pill">${window.SRGF.esc(session.role)} · ${window.SRGF.esc(session.email)}</span><button class="secondary" id="logoutBtn">Logout</button>`;
        document.getElementById("logoutBtn")?.addEventListener("click",clear);
      }else{
        box.innerHTML=`<button class="secondary" id="loginBtn">Admin / Writer Login</button>`;
        document.getElementById("loginBtn")?.addEventListener("click",renderLoginPanel);
      }
    }

    // Rebuild navigation after login/logout so Auction is visible only to Admin.
    const currentPage=document.body?.dataset?.page||"";
    if(window.SRGF?.nav) window.SRGF.nav(currentPage);
    document.body?.classList.toggle("is-admin",canAuction());
    document.body?.classList.toggle("is-writer",canEditFixtures()&&!canAuction());
  }

  function configureGoogle(callback,emailHint=""){
    window.google.accounts.id.initialize({
      client_id:C.GOOGLE_CLIENT_ID,
      callback,
      ...(emailHint ? {login_hint:emailHint} : {})
    });
  }

  async function startLogin(){
    try{
      if(!C?.GOOGLE_CLIENT_ID || C.GOOGLE_CLIENT_ID.includes("PASTE_")){
        throw new Error("Google login is not configured yet.");
      }
      await loadGoogleIdentityServices();

      // Do not pass login_hint here. Leaving it empty is important because
      // Google then shows its account chooser. The chooser includes Google's
      // own option for using another account, which opens the email/password
      // sign-in screen.
      window.google.accounts.id.initialize({
        client_id:C.GOOGLE_CLIENT_ID,
        callback:async response=>{
          try{
            if(!response?.credential) throw new Error("Google did not return a login credential.");
            await verifyToken(response.credential);
          }catch(e){
            showLoginError("Login was not authorized: "+(e.message||e));
            clear();
          }
        },
        auto_select:false,
        use_fedcm_for_button:false
      });

      try{window.google.accounts.id.disableAutoSelect()}catch(_){}

      const holder=document.getElementById("googleSignInButton");
      if(!holder)throw new Error("Google Sign-In button could not be displayed.");
      holder.innerHTML="";
      window.google.accounts.id.renderButton(holder,{
        type:"standard",
        theme:"outline",
        size:"large",
        text:"signin_with",
        shape:"rectangular",
        width:260,
        logo_alignment:"left",
        button_auto_select:false
      });
    }catch(e){
      showLoginError(e.message||String(e));
    }
  }

  function bindActivityTracking(){
    const events=["click","input","change","keydown","touchstart"];
    events.forEach(eventName=>{
      document.addEventListener(eventName,resetInactivityTimer,{passive:true});
    });
  }

  async function init(){
    bindActivityTracking();
    render();
    const s=readStored();
    if(!s.token)return;
    const now=Date.now();
    // Keep the existing browser login across refreshes for 60 minutes.
    if(s.expiresAt && now < Number(s.expiresAt)){
      session={role:String(s.role||"USER").toUpperCase(),email:s.email||"",token:s.token,loginAt:Number(s.loginAt||now),expiresAt:Number(s.expiresAt)};
      lastActivityWrite=now;
      render();
      armExpiryTimer();
      return;
    }
    // Upgrade an older saved session (from before the 60-minute expiry was added).
    if(!s.expiresAt){
      try{ await verifyToken(s.token); return; }catch(_){ clear(); return; }
    }
    clear();
  }

  // Keep the login alive for 60 minutes from the user's last interaction.
  // A click, typing/edit, selection change, or touch resets the 60-minute window.
  window.SRGFAuth={init,role,canAuction,canEditFixtures,token:()=>session.token,email:()=>session.email,clear,login:startLogin};
})();
