import { useEffect, useMemo, useState } from 'react';

const FRAMES = [
  '/avatar/lipsync/kurage_mouth_0.png',
  '/avatar/lipsync/kurage_mouth_1.png',
  '/avatar/lipsync/kurage_mouth_2.png',
  '/avatar/lipsync/kurage_mouth_3.png',
  '/avatar/lipsync/kurage_mouth_4.png',
] as const;

function useAutoMouth() {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const pattern = [0, 2, 4, 1, 3, 0, 2, 4, 0, 1, 3, 0];
    let index = 0;
    const timer = window.setInterval(() => {
      setLevel(pattern[index % pattern.length]);
      index += 1;
    }, 130);
    return () => window.clearInterval(timer);
  }, []);

  return level;
}

function useAutoBlink() {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let blinkTimer = 0;
    let openTimer = 0;
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        setBlink(true);
        openTimer = window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 120);
      }, 1800 + Math.random() * 2800);
    };
    schedule();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(openTimer);
    };
  }, []);

  return blink;
}

export function Inochi2dSample() {
  const mouthLevel = useAutoMouth();
  const blinking = useAutoBlink();
  const frameLabels = useMemo(
    () => ['closed', 'small', 'medium', 'open', 'wide'],
    [],
  );

  return (
    <main className="inochi-sample-page">
      <section className="inochi-sample-hero">
        <div>
          <p className="inochi-kicker">Kurage avatar motion prototype</p>
          <h1>Inochi2D-style motion sample</h1>
          <p>
            既存のKurage avatar画像から、まばたき、口パク、呼吸、髪・クラゲ傘のゆれを
            ブラウザ上で確認するためのサンプルです。実際の.inpモデル化前に、動きの方向性を確認できます。
          </p>
        </div>
        <a className="inochi-back-link" href="/viewer?broadcast=1">
          Broadcast viewer
        </a>
      </section>

      <section className="inochi-sample-stage" aria-label="Kurage Inochi2D sample stage">
        <div className="inochi-avatar-card">
          <div className="inochi-avatar-wrap">
            <div className="inochi-breath-rig">
              <img
                className="inochi-sway-layer inochi-sway-hair-left"
                src={FRAMES[0]}
                alt=""
                aria-hidden="true"
              />
              <img
                className="inochi-sway-layer inochi-sway-hair-right"
                src={FRAMES[0]}
                alt=""
                aria-hidden="true"
              />
              <img
                className="inochi-sway-layer inochi-sway-cap"
                src={FRAMES[0]}
                alt=""
                aria-hidden="true"
              />
              {FRAMES.map((src, index) => (
                <img
                  key={src}
                  className="inochi-mouth-frame"
                  src={src}
                  alt={index === 0 ? 'Kurage avatar' : ''}
                  aria-hidden={index !== 0}
                  style={{ opacity: index === mouthLevel ? 1 : 0 }}
                  loading="eager"
                  decoding="sync"
                />
              ))}
              <div className={`inochi-blink-layer ${blinking ? 'is-blinking' : ''}`}>
                <span className="inochi-eye-line inochi-eye-left" />
                <span className="inochi-eye-line inochi-eye-right" />
              </div>
            </div>
          </div>
        </div>

        <aside className="inochi-motion-panel">
          <h2>Motion channels</h2>
          <ul>
            <li><span>まばたき</span><strong>{blinking ? 'closed' : 'open'}</strong></li>
            <li><span>口パク</span><strong>{mouthLevel}/4 {frameLabels[mouthLevel]}</strong></li>
            <li><span>呼吸</span><strong>slow Y + scale</strong></li>
            <li><span>髪・クラゲ傘</span><strong>delayed sway</strong></li>
          </ul>
          <p>
            このサンプルはまだ本物のInochi2D `.inp` ではありません。Inochi Creatorでパーツ分けとメッシュを作る前に、
            Kurageで欲しい動きの強さを確認するためのランタイム試作です。
          </p>
        </aside>
      </section>
    </main>
  );
}
