import React, { useEffect, useState } from 'react';
import '../styles/patient.css';

// SVG Character avatars
const Characters = [
  // Char 0: Curly brown hair, teal shirt, warm skin
  {
    hairColor: '#8B5A2B',
    shirtColor: '#4E8098',
    skinColor: '#E29578',
    hairType: 'curly'
  },
  // Char 1: Blonde bob, peach shirt, fair skin
  {
    hairColor: '#E9C46A',
    shirtColor: '#E76F51',
    skinColor: '#FFD166',
    hairType: 'bob'
  },
  // Char 2: Short black hair, purple shirt, deep warm skin
  {
    hairColor: '#2D3748',
    shirtColor: '#8338EC',
    skinColor: '#8C5E50',
    hairType: 'short'
  },
  // Char 3: Glasses, orange shirt, tan skin
  {
    hairColor: '#1A202C',
    shirtColor: '#F4A261',
    skinColor: '#F3C68F',
    hairType: 'glasses'
  },
  // Char 4: Pink shirt, long red hair, fair skin
  {
    hairColor: '#D94E34',
    shirtColor: '#F26419',
    skinColor: '#FDF0D5',
    hairType: 'long'
  }
];

function CharacterAvatar({ charIndex, x, y, size = 32, isMe = false, name = "" }) {
  const char = Characters[charIndex % Characters.length];
  const halfSize = size / 2;

  return (
    <g transform={`translate(${x - halfSize}, ${y - size})`} className="character-avatar">
      {/* "YOU" Arrow Indicator */}
      {isMe && (
        <g transform={`translate(${halfSize}, -14)`}>
          <text 
            x="0" 
            y="0" 
            textAnchor="middle" 
            className="avatar-me-label"
          >
            YOU
          </text>
          <path 
            d="M -3 -2 L 0 2 L 3 -2" 
            fill="none" 
            stroke="var(--secondary-color)" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Body/Shirt */}
      <path 
        d={`M 4 ${size} C 4 ${size - 10}, ${size - 4} ${size - 10}, ${size - 4} ${size} Z`} 
        fill={char.shirtColor} 
      />
      
      {/* Head */}
      <circle cx={halfSize} cy={halfSize} r={8} fill={char.skinColor} />
      
      {/* Face details (eyes) */}
      <circle cx={halfSize - 3} cy={halfSize - 1} r={0.8} fill="#2D3748" />
      <circle cx={halfSize + 3} cy={halfSize - 1} r={0.8} fill="#2D3748" />
      {/* Smile */}
      <path d={`M ${halfSize - 2} ${halfSize + 2} Q ${halfSize} ${halfSize + 4.5} ${halfSize + 2} ${halfSize + 2}`} fill="none" stroke="#2D3748" strokeWidth="0.8" strokeLinecap="round" />

      {/* Hair */}
      {char.hairType === 'curly' && (
        <path d={`M ${halfSize - 8} ${halfSize - 1} C ${halfSize - 10} ${halfSize - 9}, ${halfSize + 10} ${halfSize - 9}, ${halfSize + 8} ${halfSize - 1} C ${halfSize + 6} ${halfSize - 6}, ${halfSize - 6} ${halfSize - 6}, ${halfSize - 8} ${halfSize - 1}`} fill={char.hairColor} />
      )}
      
      {char.hairType === 'bob' && (
        <path d={`M ${halfSize - 9} ${halfSize + 2} L ${halfSize - 9} ${halfSize - 4} Q ${halfSize} ${halfSize - 10} ${halfSize + 9} ${halfSize - 4} L ${halfSize + 9} ${halfSize + 2} Q ${halfSize + 7} ${halfSize - 2} ${halfSize + 6} ${halfSize - 3} Q ${halfSize} ${halfSize - 4} ${halfSize - 6} ${halfSize - 3} Z`} fill={char.hairColor} />
      )}

      {char.hairType === 'short' && (
        <path d={`M ${halfSize - 8} ${halfSize - 2} Q ${halfSize} ${halfSize - 10} ${halfSize + 8} ${halfSize - 2} Q ${halfSize + 5} ${halfSize - 5} ${halfSize} ${halfSize - 5} Q ${halfSize - 5} ${halfSize - 5} ${halfSize - 8} ${halfSize - 2}`} fill={char.hairColor} />
      )}

      {char.hairType === 'glasses' && (
        <g>
          {/* Hair */}
          <path d={`M ${halfSize - 8} ${halfSize - 2} Q ${halfSize} ${halfSize - 9} ${halfSize + 8} ${halfSize - 2} Z`} fill={char.hairColor} />
          {/* Glasses frame */}
          <circle cx={halfSize - 3} cy={halfSize - 1} r={2.5} fill="none" stroke="#1A202C" strokeWidth="0.8" />
          <circle cx={halfSize + 3} cy={halfSize - 1} r={2.5} fill="none" stroke="#1A202C" strokeWidth="0.8" />
          <line x1={halfSize - 1} y1={halfSize - 1} x2={halfSize + 1} y2={halfSize - 1} stroke="#1A202C" strokeWidth="0.8" />
        </g>
      )}

      {char.hairType === 'long' && (
        <path d={`M ${halfSize - 8} ${halfSize + 6} L ${halfSize - 8} ${halfSize - 4} Q ${halfSize} ${halfSize - 11} ${halfSize + 8} ${halfSize - 4} L ${halfSize + 8} ${halfSize + 6} L ${halfSize + 6} ${halfSize + 6} L ${halfSize + 6} ${halfSize - 2} Q ${halfSize} ${halfSize - 4} ${halfSize - 6} ${halfSize - 2} L ${halfSize - 6} ${halfSize + 6} Z`} fill={char.hairColor} />
      )}

      {/* Label for patient name below (first name only, truncated) */}
      <text 
        x={halfSize} 
        y={size + 11} 
        textAnchor="middle" 
        fontSize="8" 
        fontWeight="500" 
        fill="var(--text-secondary)"
      >
        {name.split(' ')[0].slice(0, 7)}
      </text>
    </g>
  );
}

export default function QueueIllustration({ queue, myTokenId, doctorStatus }) {
  const [activeQueue, setActiveQueue] = useState([]);
  const [calledChar, setCalledChar] = useState(null);
  const [calledTransitioning, setCalledTransitioning] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);

  // Filter only 'waiting' and 'in_progress' tokens
  const activeTokens = queue.filter(t => t.status === 'waiting' || t.status === 'in_progress');
  const myToken = queue.find(t => t.id === myTokenId);

  useEffect(() => {
    // 1. Check if there's someone in_progress right now
    const currentActive = queue.find(t => t.status === 'in_progress');
    const wasWaitingBefore = activeQueue.find(t => t.id === currentActive?.id && t.status === 'waiting');
    
    if (currentActive && wasWaitingBefore) {
      // Trigger Called Animation!
      const charIndex = currentActive.token_number;
      setCalledChar({
        ...currentActive,
        charIndex
      });
      setDoorOpen(true);
      setCalledTransitioning(true);

      // Animation lifecycle:
      // Slide to door (400ms) -> Enter room -> Door closes (after 1000ms total)
      const timer1 = setTimeout(() => {
        setCalledTransitioning(false); // Finished slide, disappear into door
      }, 500);

      const timer2 = setTimeout(() => {
        setDoorOpen(false); // Close door
        setCalledChar(null);
      }, 1200);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else {
      // Normal Sync
      setDoorOpen(doctorStatus === 'With patient');
    }

    // Set the list of waiting characters (excluding the one being actively animated into the room)
    const waitingOnly = queue.filter(t => t.status === 'waiting');
    setActiveQueue(waitingOnly);

  }, [queue, doctorStatus]);

  // Determine positions of avatars
  // Canvas is 360 x 180 (scaled dynamically)
  const deskX = 145;
  const deskY = 125;
  const doorX = 45;
  const doorY = 125;
  
  // Waiting queue line coordinates: starts at X=210, goes right
  // We can show at most 4 people in line, plus a +X indicator
  const maxVisibleAvatars = 4;
  const displayQueue = activeQueue.slice(0, maxVisibleAvatars);
  const extraCount = Math.max(0, activeQueue.length - maxVisibleAvatars);

  return (
    <div className="illustration-canvas">
      <svg viewBox="0 0 360 180" className="illustration-svg">
        {/* Wall & Floor Background */}
        <rect x="0" y="0" width="360" height="125" className="svg-wall" />
        <rect x="0" y="125" width="360" height="55" className="svg-floor" />
        <line x1="0" y1="125" x2="360" y2="125" stroke="#D3C9BA" strokeWidth="2" />

        {/* Doctor's Room Door */}
        <g transform={`translate(${doorX}, ${doorY - 90})`}>
          {/* Dark interior inside door frame */}
          <rect x="0" y="0" width="45" height="90" fill="#423930" />
          <rect x="15" y="30" width="15" height="40" fill="#E6FFFA" opacity={doorOpen ? 0.15 : 0} />
          {/* Door Frame */}
          <rect x="-3" y="-3" width="51" height="93" fill="none" stroke="var(--border-color)" strokeWidth="3" />
          {/* Door panel (Open/Close) */}
          <rect 
            x="0" 
            y="0" 
            width="45" 
            height="90" 
            className={`svg-door ${doorOpen ? 'door-open' : ''}`} 
          />
          {/* Door handle */}
          {!doorOpen && (
            <circle cx="6" cy="45" r="2.5" fill="#E0A96D" />
          )}
          {/* Sign on Door */}
          {!doorOpen && (
            <rect x="12" y="15" width="21" height="10" fill="white" rx="1" stroke="#D3C9BA" strokeWidth="0.5" />
          )}
          {!doorOpen && (
            <text x="22.5" y="22" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--text-secondary)">DOCTOR</text>
          )}
        </g>

        {/* Receptionist Desk & Character */}
        <g transform={`translate(${deskX}, ${deskY - 45})`}>
          {/* Chair */}
          <rect x="12" y="10" width="16" height="25" rx="2" className="svg-chair" />
          <line x1="20" y1="35" x2="20" y2="45" stroke="#C4B9A7" strokeWidth="2" />
          
          {/* Receptionist Avatar */}
          <g transform="translate(4, -2)" className="svg-receptionist">
            {/* Body */}
            <path d="M 4 32 C 4 24, 24 24, 24 32 Z" fill="#D98A6C" />
            {/* Head */}
            <circle cx="14" cy="18" r="7" fill="#F3C68F" />
            {/* Hair */}
            <path d="M 6 18 Q 14 8 22 18 Z" fill="#2D3748" />
            <path d="M 6 18 L 6 25 L 9 25 L 9 18 Z" fill="#2D3748" />
            <path d="M 22 18 L 22 25 L 19 25 L 19 18 Z" fill="#2D3748" />
            {/* Smile/Face */}
            <circle cx="12" cy="17" r="0.8" fill="#1A202C" />
            <circle cx="16" cy="17" r="0.8" fill="#1A202C" />
            <path d="M 12.5 20 Q 14 22 15.5 20" fill="none" stroke="#1A202C" strokeWidth="0.8" strokeLinecap="round" />
          </g>

          {/* Desk */}
          <path d="M 0 25 L 42 25 L 42 45 L 0 45 Z" className="svg-desk" />
          <rect x="-2" y="22" width="46" height="4" fill="#C4B9A7" rx="1" />
          {/* Laptop on desk */}
          <path d="M 6 22 L 18 22 L 15 15 L 9 15 Z" fill="#E2E8F0" />
          <line x1="6" y1="22" x2="18" y2="22" stroke="#475569" strokeWidth="1" />
        </g>

        {/* Dynamic Called Patient Animation Overlay */}
        {calledChar && calledTransitioning && (
          <g style={{
            transition: 'transform 450ms ease-out',
            transform: `translateX(${doorX + 22}px)`,
          }}>
            <CharacterAvatar 
              charIndex={calledChar.charIndex} 
              x={0} 
              y={deskY} 
              size={32}
              isMe={calledChar.id === myTokenId}
              name={calledChar.name}
            />
          </g>
        )}

        {/* Waiting Line Avatars */}
        <g className="avatar-group">
          {displayQueue.map((patient, index) => {
            // Compute X position: starts at 215, increments by 38px
            const xPos = 215 + index * 38;
            return (
              <g key={patient.id} className="fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                <CharacterAvatar 
                  charIndex={patient.token_number}
                  x={xPos} 
                  y={deskY} 
                  size={32} 
                  isMe={patient.id === myTokenId}
                  name={patient.name}
                />
              </g>
            );
          })}
        </g>

        {/* Extra Queue indicator if line overflows */}
        {extraCount > 0 && (
          <g transform={`translate(${215 + maxVisibleAvatars * 38}, ${deskY - 16})`}>
            <circle cx="12" cy="0" r="12" fill="var(--primary-color)" />
            <text 
              x="12" 
              y="4" 
              textAnchor="middle" 
              fill="white" 
              fontSize="10" 
              fontWeight="700"
              fontFamily="var(--font-sans)"
            >
              +{extraCount}
            </text>
            <text 
              x="12" 
              y="20" 
              textAnchor="middle" 
              fill="var(--text-secondary)" 
              fontSize="8" 
              fontWeight="500"
            >
              more
            </text>
          </g>
        )}

        {/* Empty waiting room visual decor */}
        {activeQueue.length === 0 && !calledChar && (
          <g transform="translate(240, 60)">
            {/* Cute empty bench illustration */}
            <rect x="0" y="30" width="70" height="6" fill="#C4B9A7" rx="1" />
            <line x1="10" y1="35" x2="10" y2="55" stroke="#C4B9A7" strokeWidth="3" />
            <line x1="60" y1="35" x2="60" y2="55" stroke="#C4B9A7" strokeWidth="3" />
            <rect x="5" y="10" width="60" height="20" fill="none" stroke="#C4B9A7" strokeWidth="3" rx="1" />
            <text x="35" y="23" textAnchor="middle" fontSize="7" fontWeight="500" fill="var(--text-light)" fontStyle="italic">Waiting Area</text>
          </g>
        )}
      </svg>
    </div>
  );
}
