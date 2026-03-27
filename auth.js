// ── DEKA Dashboard Auth System ──
// Shared across portfolio + pipeline dashboards
// Uses Supabase Auth for login + user settings

const SUPABASE_URL = 'https://sjhselvmozcntyvlvpan.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaHNlbHZtb3pjbnR5dmx2cGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTUzNzEsImV4cCI6MjA5MDAzMTM3MX0.Q3BEJi2Ow9peepXgRhE18Pb8uYZk_HwUMKK0js58smI';

let _supabase = null;
let _currentUser = null;
let _userProfile = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// ── Auth Check ──
async function dekaAuthCheck() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    showAuthGate();
    return false;
  }

  _currentUser = session.user;

  // Check if user is active in deka_users
  const { data: profile, error } = await sb.from('deka_users')
    .select('*')
    .eq('id', _currentUser.id)
    .single();

  if (error || !profile) {
    showAuthGate('Account not found. Please contact your administrator.');
    return false;
  }

  if (!profile.active) {
    showAuthGate('Your access has been revoked. Please contact your administrator.');
    return false;
  }

  _userProfile = profile;

  // Load settings from deka_user_settings
  const { data: settings } = await sb.from('deka_user_settings')
    .select('*')
    .eq('user_id', _currentUser.id)
    .single();

  if (settings) {
    window.SETTINGS = {
      firstName: settings.first_name || profile.full_name?.split(' ')[0] || '',
      fullName: profile.full_name || '',
      region: profile.region || '',
      regionFilter: profile.region_filter || '',
      calendarLink: settings.calendar_link || '',
      emailSignature: settings.email_signature || '',
      territoryDesc: settings.territory_desc || '',
      states: settings.states || ''
    };
    localStorage.setItem('deka_settings', JSON.stringify(window.SETTINGS));
  } else {
    // First login — show settings setup
    showSettingsSetup();
    return 'needs_setup';
  }

  // Update nav with logout button
  addLogoutButton();
  return true;
}

// ── Login ──
async function dekaLogin(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

// ── Logout ──
async function dekaLogout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  localStorage.removeItem('deka_settings');
  window.location.reload();
}

// ── Save Settings to Supabase ──
async function dekaSaveSettings(settings) {
  const sb = getSupabase();
  if (!_currentUser) return false;

  const { error } = await sb.from('deka_user_settings').upsert({
    user_id: _currentUser.id,
    first_name: settings.firstName,
    calendar_link: settings.calendarLink,
    email_signature: settings.emailSignature,
    territory_desc: settings.territoryDesc,
    states: settings.states,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  if (!error) {
    // Also update region_filter in deka_users if provided
    if (settings.regionFilter) {
      await sb.from('deka_users')
        .update({ region_filter: settings.regionFilter })
        .eq('id', _currentUser.id);
    }

    window.SETTINGS = settings;
    localStorage.setItem('deka_settings', JSON.stringify(settings));
  }

  return !error;
}

// ── UI: Auth Gate ──
function showAuthGate(errorMsg) {
  const existing = document.getElementById('deka-auth-gate');
  if (existing) existing.remove();

  const gate = document.createElement('div');
  gate.id = 'deka-auth-gate';
  gate.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0d0f14;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
  gate.innerHTML = `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:12px;padding:40px;max-width:400px;width:90%;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#e74c3c;letter-spacing:2px;margin-bottom:4px">DEKA</div>
      <div style="font-size:14px;color:#8b92a5;margin-bottom:24px">Dashboard Login</div>
      ${errorMsg ? `<div style="color:#e74c3c;font-size:12px;margin-bottom:16px;padding:8px;background:rgba(231,76,60,0.1);border-radius:6px">${errorMsg}</div>` : ''}
      <input id="auth-email" type="email" placeholder="Email address"
        style="width:100%;padding:12px;background:#1c2333;border:1px solid #21262d;border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;margin-bottom:8px;outline:none"
        onfocus="this.style.borderColor='#e74c3c'" onblur="this.style.borderColor='#21262d'">
      <input id="auth-password" type="password" placeholder="Password"
        onkeydown="if(event.key==='Enter')document.getElementById('auth-login-btn').click()"
        style="width:100%;padding:12px;background:#1c2333;border:1px solid #21262d;border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;margin-bottom:8px;outline:none"
        onfocus="this.style.borderColor='#e74c3c'" onblur="this.style.borderColor='#21262d'">
      <div id="auth-error" style="display:none;color:#e74c3c;font-size:12px;margin-bottom:8px"></div>
      <button id="auth-login-btn" onclick="_doLogin()" style="width:100%;padding:10px;background:#e74c3c;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.5px">Sign In</button>
      <div style="margin-top:16px;font-size:11px;color:#555">Contact your administrator for access</div>
    </div>`;
  document.body.prepend(gate);
  document.body.style.overflow = 'hidden';

  // Hide dashboard content
  Array.from(document.body.children).forEach(el => {
    if (el.id !== 'deka-auth-gate') el.style.display = 'none';
  });
}

async function _doLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-login-btn');

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Signing in...';
  btn.disabled = true;

  const result = await dekaLogin(email, password);

  if (result.success) {
    window.location.reload();
  } else {
    errEl.textContent = result.message || 'Login failed. Please try again.';
    errEl.style.display = 'block';
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

// ── UI: Settings Setup (first login) ──
function showSettingsSetup() {
  const existing = document.getElementById('deka-settings-setup');
  if (existing) existing.remove();

  const profile = _userProfile || {};
  const overlay = document.createElement('div');
  overlay.id = 'deka-settings-setup';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(13,15,20,0.95);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
  overlay.innerHTML = `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:12px;padding:32px;max-width:480px;width:90%;max-height:90vh;overflow-y:auto">
      <div style="font-size:18px;font-weight:700;color:#e6edf3;margin-bottom:4px">Welcome to DEKA Dashboard</div>
      <div style="font-size:12px;color:#8b92a5;margin-bottom:20px">Let's personalize your dashboard. This info is used in emails, headers, and templates.</div>
      <div style="display:grid;gap:12px">
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">First Name</label><input id="setup-first" value="${profile.full_name?.split(' ')[0]||''}" style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Region</label><input id="setup-region" value="${profile.region||''}" readonly style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#8b92a5;font-size:13px;box-sizing:border-box" title="Set by your administrator"></div>
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Region Filter Value <span style="color:#555">(must match your CRM sheet)</span></label><input id="setup-regionfilter" value="${profile.region_filter||''}" style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Calendar Booking Link</label><input id="setup-calendar" type="url" placeholder="https://calendar.app.google/..." style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Territory Description <span style="color:#555">(e.g. "Maine to Virginia")</span></label><input id="setup-territory" style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Email Signature <span style="color:#555">(multi-line)</span></label><textarea id="setup-signature" rows="3" placeholder="${profile.full_name||'Your Name'}&#10;DEKA Fitness — ${profile.region||'Region'} Account Manager" style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box;resize:vertical"></textarea></div>
        <div><label style="font-size:10px;color:#8b92a5;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Your States <span style="color:#555">(comma-separated)</span></label><input id="setup-states" placeholder="CT,MA,NJ,NY,PA,VA" style="width:100%;padding:8px;background:#1c2333;border:1px solid #21262d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box"></div>
      </div>
      <button onclick="_doSaveSetup()" style="width:100%;margin-top:20px;padding:10px;background:#e74c3c;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer">Save & Get Started</button>
    </div>`;
  document.body.prepend(overlay);
}

async function _doSaveSetup() {
  const settings = {
    firstName: document.getElementById('setup-first').value.trim(),
    fullName: _userProfile?.full_name || '',
    region: _userProfile?.region || '',
    regionFilter: document.getElementById('setup-regionfilter').value.trim(),
    calendarLink: document.getElementById('setup-calendar').value.trim(),
    emailSignature: document.getElementById('setup-signature').value.trim(),
    territoryDesc: document.getElementById('setup-territory').value.trim(),
    states: document.getElementById('setup-states').value.trim()
  };

  const saved = await dekaSaveSettings(settings);
  if (saved) {
    document.getElementById('deka-settings-setup').remove();
    document.body.style.overflow = '';
    window.location.reload();
  }
}

// ── Logout Button ──
function addLogoutButton() {
  // Add logout to nav area if not already present
  if (document.getElementById('deka-logout-btn')) return;
  const nav = document.querySelector('.header-actions') || document.querySelector('.nav-tab')?.parentElement;
  if (nav) {
    const btn = document.createElement('button');
    btn.id = 'deka-logout-btn';
    btn.className = 'btn btn-ghost btn-sm no-print';
    btn.style.cssText = 'font-size:11px;color:var(--text-dim,#8b92a5);border-color:transparent;margin-left:4px';
    btn.textContent = 'Logout';
    btn.onclick = dekaLogout;
    nav.appendChild(btn);
  }
}

// ── Admin Functions ──
async function dekaAdminGetUsers() {
  const sb = getSupabase();
  const { data, error } = await sb.from('deka_users').select('*').order('created_at', { ascending: false });
  return error ? [] : data;
}

async function dekaAdminInviteUser(email, fullName, region, regionFilter) {
  const sb = getSupabase();

  // Create auth user with a temporary password
  const tempPassword = 'DEKA-' + Math.random().toString(36).slice(2, 10).toUpperCase();

  const { data: authData, error: authError } = await sb.auth.signUp({
    email,
    password: tempPassword,
    options: { data: { full_name: fullName, region } }
  });

  if (authError) return { success: false, message: authError.message };

  // Create deka_users row
  const { error: dbError } = await sb.from('deka_users').insert({
    id: authData.user.id,
    email,
    full_name: fullName,
    region,
    region_filter: regionFilter || '',
    role: 'manager',
    active: true
  });

  if (dbError) return { success: false, message: dbError.message };

  return { success: true, tempPassword };
}

async function dekaAdminToggleUser(userId, active) {
  const sb = getSupabase();
  const { error } = await sb.from('deka_users').update({ active }).eq('id', userId);
  return !error;
}
