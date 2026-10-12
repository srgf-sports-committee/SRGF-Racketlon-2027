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
  function canViewLogs(){return role()==="ADMIN";}
  function canViewCaptains(){return role()==="ADMIN"||role()==="CAPTAIN";}

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
        <div class="srgf-login-title">Login</div>
        <div class="srgf-login-help">Choose one of your Google accounts. If the account you need is not listed, Google provides an option to use another account and enter its email address.</div>
        <div id="googleSignInButton" class="srgf-google-button"></div>
        <button class="secondary srgf-login-cancel" id="srgfLoginCancel" type="button">Cancel</button>
        <div class="srgf-login-error hidden" id="srgfLoginError"></div>
        <div class="srgf-login-note">Google handles the password and security. This website only receives the Google sign-in credential and then checks the account against the ACCESS sheet.</div>
      </div>`;

    document.getElementById("srgfLoginCancel")?.addEventListener("click",render);
    // Initialize Google Sign-In before rendering the official Google button.
    // This is required so the button has the account-picker callback attached.
    setTimeout(startLogin,0);
  }

  function render(){
    const box=document.getElementById("authBox");
    if(box){
      const whatsappLink = `<a class="srgf-whatsapp-link" href="https://chat.whatsapp.com/CTL9t7xGjz80LWU1Sp2hH8?s=cl&p=i&mlu=4" target="_blank" rel="noopener noreferrer" aria-label="Join the SRGF Racketlon 2027 WhatsApp group"><svg class="srgf-whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.5 0 .15 5.35.15 11.93c0 2.1.55 4.15 1.6 5.96L.05 24l6.27-1.64a11.9 11.9 0 0 0 5.76 1.47h.01c6.58 0 11.93-5.35 11.93-11.93 0-3.19-1.24-6.19-3.5-8.42ZM12.09 21.8a9.9 9.9 0 0 1-5.05-1.39l-.36-.21-3.72.97.99-3.63-.24-.37a9.86 9.86 0 0 1-1.52-5.24c0-5.46 4.44-9.9 9.9-9.9a9.84 9.84 0 0 1 7.01 2.91 9.84 9.84 0 0 1 2.9 7.01c0 5.46-4.44 9.9-9.91 9.9Zm5.43-7.41c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.27.5 1.7.64.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.08-.12-.27-.2-.57-.35Z"/></svg>Join</a>`;
      if(session.token){
        box.innerHTML=`<span class="role-pill">${window.SRGF.esc(session.role)} · ${window.SRGF.esc(session.email)}</span><button class="secondary" id="logoutBtn">Logout</button>${whatsappLink}`;
        document.getElementById("logoutBtn")?.addEventListener("click",clear);
      }else{
        box.innerHTML=`<button class="secondary" id="loginBtn">Login</button>${whatsappLink}`;
        document.getElementById("loginBtn")?.addEventListener("click",renderLoginPanel);
      }
      if(!document.getElementById("srgfWhatsAppStyles")){
        const style=document.createElement("style");
        style.id="srgfWhatsAppStyles";
        style.textContent=".srgf-whatsapp-link{display:inline-flex;align-items:center;justify-content:center;gap:5px;margin-left:10px;padding:8px 10px;border-radius:9px;background:#128c4a;color:#fff!important;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;box-shadow:0 2px 10px rgba(18,140,74,.25)}.srgf-whatsapp-icon{width:15px;height:15px;flex:0 0 15px}.srgf-whatsapp-link:focus-visible{outline:3px solid #b7df35;outline-offset:3px}@media(max-width:600px){.srgf-whatsapp-link{margin-left:0;margin-top:6px;padding:7px 9px;font-size:11px}.srgf-whatsapp-icon{width:14px;height:14px;flex-basis:14px}}";
        document.head.appendChild(style);
      }
    }

    // Rebuild navigation after login/logout so Auction is visible only to Admin.
    const currentPage=document.body?.dataset?.page||"";
    if(window.SRGF?.nav) window.SRGF.nav(currentPage);
    document.body?.classList.toggle("is-admin",canAuction());
    document.body?.classList.toggle("is-writer",canEditFixtures()&&!canAuction());
    window.dispatchEvent(new Event("srgf-auth-change"));
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
  window.SRGFAuth={init,role,canAuction,canEditFixtures,canViewLogs,canViewCaptains,token:()=>session.token,email:()=>session.email,clear,login:startLogin};
})();
