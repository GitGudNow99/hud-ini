import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HudIni } from '../../src/react.js';
function Fixture() {
  const [show, setShow] = useState(true),
    [time, setTime] = useState(0);
  return (
    <>
      <button onClick={() => setShow(!show)}>Toggle</button>
      <button onClick={() => setTime(3)}>Expire</button>
      <div style={{ width: 640, height: 360 }}>
        {show && (
          <HudIni
            frame={{
              time,
              label: 'REACT TEST',
              source: 'demo',
              headingDeg: { value: 0, at: 0 },
              groundSpeedMps: { value: 1, at: 0 },
            }}
          />
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
