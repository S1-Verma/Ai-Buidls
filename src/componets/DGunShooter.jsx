import React, { useState, useEffect, useRef } from 'react';
import { Target, Shield, Zap, RotateCcw, Play, Award, AlertTriangle, Crosshair, Flame } from 'lucide-react';

// --- GAME CONFIGURATION & LEVEL DATA ---
const LEVELS = Array.from({ length: 10 }, (_, i) => {
  const lvl = i + 1;
  return {
    level: lvl,
    targetSpeedX: 1.5 + lvl * 0.5,
    targetSpeedY: lvl > 4 ? 0.8 + lvl * 0.2 : 0,
    targetBaseRadius: Math.max(40 - lvl * 2, 18),
    targetCount: lvl > 7 ? 3 : lvl > 3 ? 2 : 1,
    requiredScore: 60 + lvl * 40,
    timeLimit: 30, // 30 seconds
  };
});

export default function DGunShooter() {
  // Game States: 'START' | 'PLAYING' | 'LEVEL_WIN' | 'GAME_OVER' | 'VICTORY'
  const [gameState, setGameState] = useState('START');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [bullets, setBullets] = useState(10);
  const [isReloading, setIsReloading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  // Canvas and Game Loop Refs
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Gameplay State Refs (to avoid closure stale state in the animation loop)
  const stateRef = useRef({
    gameState: 'START',
    score: 0,
    bullets: 10,
    isReloading: false,
    crosshair: { x: 400, y: 300 },
    targets: [],
    particles: [],
    floatingTexts: [],
    flashActive: false,
    flashTimer: 0,
    shakeTimer: 0,
    tracer: null,
    dimensions: { width: 800, height: 500 }
  });

  // Sync React state to loop ref
  useEffect(() => { stateRef.current.gameState = gameState; }, [gameState]);
  useEffect(() => { stateRef.current.score = score; }, [score]);
  useEffect(() => { stateRef.current.bullets = bullets; }, [bullets]);
  useEffect(() => { stateRef.current.isReloading = isReloading; }, [isReloading]);

  const activeLevelConfig = LEVELS[currentLevel - 1];

  // --- GAME INITIALIZATION & RESET ---
  const initLevel = (lvlNum) => {
    const config = LEVELS[lvlNum - 1];
    setTimeLeft(config.timeLimit);
    setBullets(10);
    setIsReloading(false);
    
    // Create targets with initial properties
    const newTargets = [];
    for (let i = 0; i < config.targetCount; i++) {
      newTargets.push({
        x: Math.random() * 400 + 200,
        y: Math.random() * 150 + 100,
        z: 500, // Distance away from player (500px deep)
        targetZ: 100 + Math.random() * 100, // Move forward to this depth
        radius: config.targetBaseRadius,
        dx: config.targetSpeedX * (Math.random() > 0.5 ? 1 : -1),
        dy: config.targetSpeedY * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2 // for smooth floating arcs
      });
    }

    stateRef.current.targets = newTargets;
    stateRef.current.particles = [];
    stateRef.current.floatingTexts = [];
    stateRef.current.tracer = null;
    stateRef.current.flashActive = false;
  };

  const startGame = () => {
    setScore(0);
    setCurrentLevel(1);
    initLevel(1);
    setGameState('PLAYING');
  };

  const startNextLevel = () => {
    const nextLvl = currentLevel + 1;
    if (nextLvl > 10) {
      setGameState('VICTORY');
    } else {
      setCurrentLevel(nextLvl);
      initLevel(nextLvl);
      setGameState('PLAYING');
    }
  };

  const restartCurrentLevel = () => {
    initLevel(currentLevel);
    setGameState('PLAYING');
  };

  // --- ACTIONS ---
  const handleReload = () => {
    if (isReloading || bullets === 10 || gameState !== 'PLAYING') return;
    setIsReloading(true);
    setTimeout(() => {
      setBullets(10);
      setIsReloading(false);
    }, 1500);
  };

  const shoot = () => {
    const state = stateRef.current;
    if (state.gameState !== 'PLAYING' || state.isReloading) return;
    if (state.bullets <= 0) {
      handleReload();
      return;
    }

    // Spend Bullet
    const remainingBullets = state.bullets - 1;
    setBullets(remainingBullets);

    // Visual Trigger Effects
    state.flashActive = true;
    state.flashTimer = 5; // frame length
    state.shakeTimer = 8; // frame length
    
    // Set line tracer starting from gun tip at bottom center
    state.tracer = {
      startX: state.dimensions.width / 2,
      startY: state.dimensions.height,
      endX: state.crosshair.x,
      endY: state.crosshair.y,
      alpha: 1.0
    };

    // Calculate Hit Check against Pseudo-3D Targets
    let hitSomething = false;
    const updatedTargets = state.targets.map(target => {
      // Calculate depth scaling factor
      const scale = 300 / target.z; 
      const renderX = (target.x - state.dimensions.width / 2) * scale + state.dimensions.width / 2;
      const renderY = (target.y - state.dimensions.height / 2) * scale + state.dimensions.height / 2;
      const renderRadius = target.radius * scale;

      // Distance from crosshair to target center on screen
      const dist = Math.hypot(state.crosshair.x - renderX, state.crosshair.y - renderY);

      if (dist <= renderRadius && !hitSomething) {
        hitSomething = true;
        let pointsEarned = 10;
        let hitType = "OUTER";

        if (dist <= renderRadius * 0.2) {
          pointsEarned = 50;
          hitType = "BULLSEYE!";
        } else if (dist <= renderRadius * 0.6) {
          pointsEarned = 20;
          hitType = "MID RING";
        }

        // Update Global Score
        setScore(prev => {
          const nextScore = prev + pointsEarned;
          // Live check for win target condition
          if (nextScore >= activeLevelConfig.requiredScore) {
            setTimeout(() => setGameState('LEVEL_WIN'), 500);
          }
          return nextScore;
        });

        // Add Floating Hit Text
        state.floatingTexts.push({
          x: state.crosshair.x,
          y: state.crosshair.y - 10,
          text: `+${pointsEarned} ${hitType}`,
          color: pointsEarned === 50 ? '#f59e0b' : pointsEarned === 20 ? '#3b82f6' : '#10b981',
          alpha: 1.0
        });

        // Spawn Burst Impact Particles
        for (let p = 0; p < 12; p++) {
          state.particles.push({
            x: state.crosshair.x,
            y: state.crosshair.y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            radius: Math.random() * 3 + 1,
            alpha: 1,
            color: pointsEarned === 50 ? '#f59e0b' : '#3b82f6'
          });
        }

        // Reset target position deeper into space
        return {
          ...target,
          z: 600,
          x: Math.random() * 400 + 200,
          y: Math.random() * 150 + 100,
        };
      }
      return target;
    });

    state.targets = updatedTargets;

    // Trigger auto-reload if empty
    if (remainingBullets === 0) {
      handleReload();
    }
  };

  // --- CONTROLS & EVENT HANDLERS ---
  const updateCrosshairPos = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    // Scaled coordinate translation
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    stateRef.current.crosshair = {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleMouseMove = (e) => updateCrosshairPos(e.clientX, e.clientY);
  
  const handleTouchMove = (e) => {
    if (e.touches.length > 0) {
      updateCrosshairPos(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // --- COUNTDOWN GAME TIMER ---
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (stateRef.current.score < activeLevelConfig.requiredScore) {
            setGameState('GAME_OVER');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentLevel]);

  // Handle sudden empty failures
  useEffect(() => {
    if (gameState === 'PLAYING' && bullets === 0 && isReloading) {
      // Check if player has literally no chance to hit score goal with remaining time
      if (score < activeLevelConfig.requiredScore && timeLeft < 2) {
        setGameState('GAME_OVER');
      }
    }
  }, [bullets, isReloading, gameState]);


  // --- MAIN CANVAS ANIMATION ENGINE ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    stateRef.current.dimensions = { width: canvas.width, height: canvas.height };

    const renderLoop = () => {
      const state = stateRef.current;

      // Handle Screen Shake Calculations
      let dx = 0;
      let dy = 0;
      if (state.shakeTimer > 0) {
        dx = (Math.random() - 0.5) * 7;
        dy = (Math.random() - 0.5) * 7;
        state.shakeTimer--;
      }

      ctx.save();
      ctx.translate(dx, dy);

      // 1. Draw Environment Grid Background (Pseudo 3D Space Tunnel)
      ctx.fillStyle = '#0f172a'; // Deep arcade slate blue
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const horizonY = canvas.height / 2;
      const centerX = canvas.width / 2;

      // Perspective grid lines lines converging to horizon center
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        ctx.beginPath();
        ctx.moveTo(centerX, horizonY);
        ctx.lineTo(
          centerX + Math.cos(angle) * canvas.width,
          horizonY + Math.sin(angle) * canvas.height
        );
        ctx.stroke();
      }

      // 2. Move & Render Targets
      state.targets = state.targets.map(target => {
        if (state.gameState === 'PLAYING') {
          // Simulate fly-forward movement depth
          if (target.z > target.targetZ) {
            target.z -= 2; 
          }
          // Move left/right, up/down bounds
          target.x += target.dx;
          target.y += target.dy + Math.sin(Date.now() * 0.003 + target.phase) * 0.5;

          if (target.x - target.radius < 50 || target.x + target.radius > canvas.width - 50) target.dx *= -1;
          if (target.y - target.radius < 50 || target.y + target.radius > horizonY + 100) target.dy *= -1;
        }

        // Compute 3D Scaling Proportions
        const scale = 300 / target.z;
        const renderX = (target.x - centerX) * scale + centerX;
        const renderY = (target.y - horizonY) * scale + horizonY;
        const renderRadius = target.radius * scale;

        // Draw Shadows on background floor
        ctx.beginPath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.ellipse(renderX, canvas.height - 40, renderRadius, renderRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw Target Rings (Bullseye setup)
        const rings = [
          { r: 1.0, color: '#ef4444' },  // Outer Red
          { r: 0.6, color: '#ffffff' },  // Mid White
          { r: 0.2, color: '#f59e0b' }   // Center Gold
        ];

        rings.forEach(ring => {
          ctx.beginPath();
          ctx.arc(renderX, renderY, renderRadius * ring.r, 0, Math.PI * 2);
          ctx.fillStyle = ring.color;
          ctx.fill();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // Depth Cue Shading Overlay (Darkens further away objects)
        const depthOpacity = Math.min(Math.max((target.z - 100) / 500, 0), 0.6);
        ctx.beginPath();
        ctx.arc(renderX, renderY, renderRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(15, 23, 42, ${depthOpacity})`;
        ctx.fill();

        return target;
      });

      // 3. Render Shot Bullet Tracer
      if (state.tracer) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(253, 224, 71, ${state.tracer.alpha})`;
        ctx.lineWidth = 3;
        ctx.moveTo(state.tracer.startX, state.tracer.startY);
        ctx.lineTo(state.tracer.endX, state.tracer.endY);
        ctx.stroke();
        
        state.tracer.alpha -= 0.15;
        if (state.tracer.alpha <= 0) state.tracer = null;
      }

      // 4. Update & Render Particle Burst Explodes
      state.particles = state.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;
        
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(p.alpha, 0);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        return p.alpha > 0;
      });

      // 5. Update & Render Hit Floating Texts
      state.floatingTexts = state.floatingTexts.filter(ft => {
        ft.y -= 1.2;
        ft.alpha -= 0.02;
        
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = Math.max(ft.alpha, 0);
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1.0;
        
        return ft.alpha > 0;
      });

      // 6. Draw Fixed First Person Gun View
      const gunWidth = 90;
      const gunHeight = 160;
      const gunX = canvas.width / 2 - gunWidth / 2;
      const gunY = canvas.height - gunHeight + 20;

      // Muzzle Flash Effect Engine
      if (state.flashActive && state.flashTimer > 0) {
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(
          canvas.width / 2, gunY, 5,
          canvas.width / 2, gunY, 45
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.2, '#fef08a');
        gradient.addColorStop(0.6, '#f97316');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.arc(canvas.width / 2, gunY, 45, 0, Math.PI * 2);
        ctx.fill();
        
        state.flashTimer--;
        if (state.flashTimer <= 0) state.flashActive = false;
      }

      // Metal base weapon frame drawing
      ctx.fillStyle = '#475569';
      ctx.fillRect(gunX, gunY, gunWidth, gunHeight);
      
      // Secondary dark detailing/barrel lines
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(canvas.width / 2 - 12, gunY - 15, 24, gunHeight);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(canvas.width / 2 - 6, gunY - 15, 12, 30);

      // 7. Render Modern Floating Reticle Crosshair
      if (state.gameState === 'PLAYING') {
        ctx.beginPath();
        ctx.strokeStyle = state.isReloading ? '#ef4444' : '#22c55e';
        ctx.lineWidth = 2;
        ctx.arc(state.crosshair.x, state.crosshair.y, 14, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair Center Pointer Dot
        ctx.beginPath();
        ctx.fillStyle = state.isReloading ? '#ef4444' : '#22c55e';
        ctx.arc(state.crosshair.x, state.crosshair.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      requestRef.current = requestAnimationFrame(renderLoop);
    };

    requestRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [currentLevel]);


  return (
    <div className="w-full max-w-4xl mx-auto p-4 select-none">
      {/* Arcade Outer Chassis Container */}
      <div className="bg-slate-950 border-4 border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative text-white">
        
        {/* --- TOP BAR HUD DISPLAY --- */}
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block uppercase font-mono tracking-widest">Stage</span>
              <span className="text-xl font-black text-amber-500 font-mono">{currentLevel} <span className="text-xs text-slate-600">/ 10</span></span>
            </div>

            <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block uppercase font-mono tracking-widest">Score Target</span>
              <span className="text-xl font-black text-emerald-400 font-mono">{score} <span className="text-xs text-slate-500">/ {activeLevelConfig.requiredScore}</span></span>
            </div>
          </div>

          {/* Bullet Rack HUD display */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
              <Crosshair className="w-4 h-4 text-rose-500" />
              <div className="flex gap-1 items-center">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div 
                    key={index} 
                    className={`h-5 w-1.5 rounded-sm transition-all duration-150 ${
                      isReloading 
                        ? 'bg-amber-500 animate-pulse' 
                        : index < bullets 
                          ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' 
                          : 'bg-slate-800'
                    }`} 
                  />
                ))}
              </div>
              <span className="text-xs font-mono ml-2 font-bold text-slate-400">
                {isReloading ? "RELOADING" : `${bullets}/10`}
              </span>
            </div>

            {/* Timer Module */}
            <div className={`px-4 py-1.5 rounded-lg border font-mono text-center min-w-[75px] ${timeLeft <= 5 ? 'bg-rose-950/40 border-rose-500 animate-pulse text-rose-400' : 'bg-slate-950 border-slate-800 text-slate-200'}`}>
              <span className="text-xs text-slate-400 block uppercase tracking-widest">Time</span>
              <span className="text-xl font-black">{timeLeft}s</span>
            </div>
          </div>
        </div>

        {/* --- GAMEPLAY INTERACTIVE CANVAS CANVAS SCREEN AREA --- */}
        <div className="relative aspect-[16/10] bg-slate-900 overflow-hidden cursor-crosshair">
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full h-full block"
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            onClick={shoot}
            onTouchStart={(e) => {
              handleTouchMove(e);
              shoot();
            }}
          />

          {/* --- OVERLAY SCREENS SYSTEM (STATE DRIVEN) --- */}
          {gameState !== 'PLAYING' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
              
              {/* START MENU STATE */}
              {gameState === 'START' && (
                <div className="max-w-md animate-fade-in">
                  <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                    <Target className="w-8 h-8" />
                  </div>
                  <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent uppercase font-mono">
                    Range Master 3D
                  </h1>
                  <p className="text-slate-400 text-sm mb-6">
                    Test your tactical reflex depth precision. Clear 10 progressive speed-scaling simulation levels before time runs out.
                  </p>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 text-left text-xs space-y-2 text-slate-300 font-mono">
                    <p className="text-amber-500 font-bold uppercase mb-1">How to Play:</p>
                    <p>• Aim crosshair using mouse movement or screen dragging.</p>
                    <p>• Left-click or tap screen space to discharge shots.</p>
                    <p>• Bullseyes fetch maximum 50 point multipliers.</p>
                    <p>• Press <span className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">R</span> or click HUD container to manually reload magazines.</p>
                  </div>
                  <button onClick={startGame} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black py-3 px-6 rounded-xl transition duration-200 shadow-lg flex items-center justify-center gap-2 text-base uppercase tracking-wider">
                    <Play className="w-5 h-5 fill-current" /> Initialize Range
                  </button>
                </div>
              )}

              {/* LEVEL WIN TRANSITION SCREEN */}
              {gameState === 'LEVEL_WIN' && (
                <div className="max-w-sm animate-scale-up">
                  <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <Award className="w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-black text-emerald-400 font-mono mb-1 uppercase">Stage Cleared</h2>
                  <p className="text-slate-400 text-sm mb-6">
                    Target benchmark completed successfully. Total Level Score: <span className="text-white font-bold">{score}</span>
                  </p>
                  <button onClick={startNextLevel} className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-3 px-6 rounded-xl transition duration-200 shadow-lg text-sm uppercase tracking-wider">
                    Advance to Stage {currentLevel + 1}
                  </button>
                </div>
              )}

              {/* GAME OVER LOSS STATE */}
              {gameState === 'GAME_OVER' && (
                <div className="max-w-sm animate-scale-up">
                  <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-black text-rose-500 font-mono mb-1 uppercase">Mission Failed</h2>
                  <p className="text-slate-400 text-sm mb-6">
                    Failed to reach target goal of {activeLevelConfig.requiredScore} points within limits.
                  </p>
                  <button onClick={restartCurrentLevel} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl border border-slate-700 transition duration-200 shadow-lg text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Retry Level
                  </button>
                </div>
              )}

              {/* END VICTORY COMPLETED STATE */}
              {gameState === 'VICTORY' && (
                <div className="max-w-md animate-scale-up">
                  <div className="w-20 h-20 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-amber-400 animate-bounce">
                    <Flame className="w-10 h-10 fill-current" />
                  </div>
                  <h2 className="text-4xl font-black text-amber-400 font-mono mb-2 uppercase tracking-tight">Ultimate Champion</h2>
                  <p className="text-slate-300 text-sm mb-6">
                    Incredible marksman accuracy! You beat all 10 standard simulation speeds with a final score pool of <span className="text-amber-400 font-bold text-lg">{score}</span>.
                  </p>
                  <button onClick={startGame} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black py-3 px-6 rounded-xl transition duration-200 shadow-lg text-sm uppercase tracking-wider">
                    Restart Simulation Loop
                  </button>
                </div>
              )}

            </div>
          )}
        </div>

        {/* --- BOTTOM QUICK CONTROL ACTIONS BAR --- */}
        <div className="bg-slate-900/60 px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex gap-4">
            <span>• Speed Index: <strong className="text-slate-200">{activeLevelConfig.targetSpeedX}px/f</strong></span>
            <span>• Active Targets: <strong className="text-slate-200">{activeLevelConfig.targetCount}</strong></span>
          </div>
          <button 
            onClick={handleReload}
            disabled={isReloading || bullets === 10 || gameState !== 'PLAYING'}
            className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 px-4 py-1.5 rounded-lg font-bold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Manual Reload
          </button>
        </div>

      </div>
    </div>
  );
}