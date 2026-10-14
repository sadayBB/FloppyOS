import { useEffect, useRef, useState } from 'react';
import { getAttempts, recordFailure, resetAttempts, verifyPin, wipeDevice, type LockConfig } from '../lib/lock';
import { CatSprite, useCat } from '../pixel/cat';
import { Btn } from './ui';

/** Windows-2000-style logon screen. The desktop is not rendered at all while this is shown. */
export function LockScreen({ cfg, onUnlock }: { cfg: LockConfig; onUnlock: () => void }) {
  const cat = useCat();
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tick = () => setWait(Math.max(0, Math.ceil((getAttempts().until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  const submit = async () => {
    if (!pin || wait || busy) return;
    setBusy(true);
    if (await verifyPin(cfg, pin)) {
      resetAttempts();
      onUnlock();
    } else {
      const until = recordFailure();
      setMsg(until ? 'Demasiados intentos. Espera un momento.' : 'PIN incorrecto.');
      setPin('');
      input.current?.focus();
    }
    setBusy(false);
  };

  return (
    <div className="lock-screen">
      <div className="dialog lock-dialog" role="dialog" aria-label="Iniciar sesión en FloppyOS">
        <header className="titlebar"><span className="title">Iniciar sesión en FloppyOS</span></header>
        <div className="lock-banner">
          <span>Floppy<b>OS</b></span>
        </div>
        {!forgot ? (
          <form className="lock-body" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <CatSprite scale={3} palette={cat.palette} />
            <div className="lock-fields">
              <label htmlFor="pin">PIN:</label>
              <input id="pin" ref={input} className="input" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} disabled={!!wait} />
              {wait > 0 ? <p className="hint late">Espera {wait} s para volver a intentarlo.</p> : msg && <p className="hint late">{msg}</p>}
              <div className="row-btns">
                <Btn primary type="submit" disabled={!pin || !!wait || busy}>{busy ? '…' : 'Aceptar'}</Btn>
                <Btn type="button" onClick={() => setForgot(true)}>Olvidé mi PIN</Btn>
              </div>
            </div>
          </form>
        ) : (
          <div className="lock-body column">
            <p>Por seguridad, el PIN no se puede recuperar. Puedes <b>borrar los datos de este dispositivo</b> y volver a empezar: si usas la sincronización, al iniciar sesión se descargará todo de nuevo desde Supabase.</p>
            <p className="hint">Escribe BORRAR para confirmar.</p>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            <div className="row-btns">
              <Btn onClick={() => setForgot(false)}>Volver</Btn>
              <Btn disabled={confirmText.trim().toUpperCase() !== 'BORRAR'} onClick={() => void wipeDevice()}>Borrar datos de este dispositivo</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
