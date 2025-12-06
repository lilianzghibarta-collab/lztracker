import React, { useState, useEffect } from 'react';
export default function AcceptInvite(){
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const [company, setCompany] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  useEffect(()=>{ if (!token) return; fetch(`/api/invites/${token}`).then(r=>r.json()).then(d=>setCompany(d.company)).catch(()=>{}); }, [token]);
  async function submit(e){ e.preventDefault(); const res = await fetch('/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password, name, inviteToken: token }) }); const j = await res.json(); if (j.token) { localStorage.setItem('token', j.token); window.location.href = '/'; } else alert('error: '+JSON.stringify(j)); }
  return (
    <div className="container">
      <h2>Accept Invite</h2>
      {company && (<div><img src={company.logoUrl} alt="logo" style={{maxWidth:120}}/><h3>{company.name}</h3></div>)}
      <form onSubmit={submit}>
        <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button>Register</button>
      </form>
    </div>
  );
}
