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
        <div class="srgf-login-help">Enter your Google email address. Google will handle the secure sign-in and account selection.</div>
        <input class="srgf-login-email" id="srgfLoginEmail" type="email" autocomplete="username" placeholder="Enter email address">
        <button class="primary srgf-login-google" id="srgfLoginGoogle" type="button">Continue with Google</button>
        <button class="secondary srgf-login-cancel" id="srgfLoginCancel" type="button">Cancel</button>
        <div class="srgf-login-error hidden" id="srgfLoginError"></div>
        <div class="srgf-login-note">The email address is only used as a hint for Google. Your Google password is entered on Google's secure sign-in page, not on this website. Access is still checked against the ACCESS sheet.</div>
      </div>`;
    const email=document.getElementById("srgfLoginEmail");
    document.getElementById("srgfLoginGoogle")?.addEventListener("click",()=>startLogin(email?.value||""));
    document.getElementById("srgfLoginCancel")?.addEventListener("click",render);
    email?.addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        e.preventDefault();
        startLogin(email.value||"");
      }
    });
    setTimeout(()=>email?.focus(),0);
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

  async function startLogin(emailHint=""){
    try{
      if(!C?.GOOGLE_CLIENT_ID || C.GOOGLE_CLIENT_ID.includes("PASTE_")){
        throw new Error("Google login is not configured yet.");
      }
      await loadGoogleIdentityServices();

      const hint=String(emailHint||"").trim().toLowerCase();
      if(hint && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(hint)){
        throw new Error("Please enter a valid Google email address.");
      }

      configureGoogle(async response=>{
        try{
          if(!response?.credential) throw new Error("Google did not return a login credential.");
          await verifyToken(response.credential);
        }catch(e){
          showLoginError("Login was not authorized: "+(e.message||e));
          clear();
        }
      },hint);

      // Clear Google's remembered auto-selection so the user can deliberately
      // choose another account. If an email was entered, Google uses it as a
      // hint; the resulting credential is still the only trusted identity.
      try{window.google.accounts.id.disableAutoSelect()}catch(_){}

      if(hint){
        // A login hint directs Google to this email. If that account is not
        // already signed in, Google can continue to its normal account
        // authentication flow, including password/verification.
        window.google.accounts.id.prompt(notification=>{
          if(notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()){
            // Fall back to Google's rendered account chooser.
            const holder=document.getElementById("googleSignInButton");
            if(holder)holder.scrollIntoView({block:"nearest"});
          }
        });
      }else{
        window.google.accounts.id.prompt();
      }
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
