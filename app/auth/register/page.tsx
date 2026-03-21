
'use client';
import { useState } from 'react';

export default function Register(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [msg,setMsg]=useState('');
  async function onSubmit(e: React.FormEvent){
    e.preventDefault();
    const res = await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,name})});
    setMsg(res.ok? 'Registered. You can now create characters.' : 'Registration failed');
  }
  return (
    <div>
      <h2>Register</h2>
      <form onSubmit={onSubmit}>
        <input placeholder='Email' value={email} onChange={e=>setEmail(e.target.value)} required/>
        <input placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder='Password' type='password' value={password} onChange={e=>setPassword(e.target.value)} required/>
        <button>Register</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}
