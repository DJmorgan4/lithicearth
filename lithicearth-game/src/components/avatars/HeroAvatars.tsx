import React from "react";

type AvatarProps = {
  size?: number;
  className?: string;
};

function SvgWrap({
  size = 240,
  className,
  children,
}: React.PropsWithChildren<AvatarProps>) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodOpacity="0.35" />
        </filter>

        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.65)" />
          <stop offset="0.35" stopColor="rgba(255,255,255,0.20)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>

        <radialGradient id="bgGlowBlue" cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#78B8FF" stopOpacity="0.45" />
          <stop offset="1" stopColor="#0B102A" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="bgGlowGold" cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#FFD27A" stopOpacity="0.45" />
          <stop offset="1" stopColor="#0B102A" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="bgGlowGreen" cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#63F0B7" stopOpacity="0.45" />
          <stop offset="1" stopColor="#0B102A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {children}
    </svg>
  );
}

/** Shared “toy figure” base */
function ToyBase({
  skin = "#F6D3B3",
  tunic = "#2D3C7A",
  belt = "#C7A34A",
  accent = "#8AD3FF",
  halo = "#2A3A8B",
}: {
  skin?: string;
  tunic?: string;
  belt?: string;
  accent?: string;
  halo?: string;
}) {
  return (
    <g filter="url(#softShadow)">
      {/* backdrop card */}
      <rect x="18" y="18" width="204" height="204" rx="28" fill="#0B102A" />
      <rect x="18" y="18" width="204" height="204" rx="28" fill="url(#shine)" opacity="0.35" />

      {/* glow ring */}
      <circle cx="120" cy="112" r="78" fill={halo} opacity="0.18" />
      <circle cx="120" cy="112" r="56" fill={halo} opacity="0.10" />

      {/* head */}
      <g>
        <rect x="72" y="52" width="96" height="88" rx="34" fill={skin} />
        {/* cheek shine */}
        <path
          d="M88 80 C95 70, 110 64, 126 64 C110 72, 98 86, 94 102 C90 96, 86 90, 88 80 Z"
          fill="rgba(255,255,255,0.20)"
        />
      </g>

      {/* eyes */}
      <g>
        <circle cx="104" cy="98" r="8" fill="#111827" />
        <circle cx="136" cy="98" r="8" fill="#111827" />
        <circle cx="101" cy="95" r="2.6" fill="white" opacity="0.9" />
        <circle cx="133" cy="95" r="2.6" fill="white" opacity="0.9" />
      </g>

      {/* smile */}
      <path
        d="M104 122 C112 130, 128 130, 136 122"
        stroke="#7A4B35"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* torso */}
      <g>
        <rect x="64" y="142" width="112" height="64" rx="22" fill={tunic} />
        <rect x="64" y="176" width="112" height="20" rx="10" fill={belt} opacity="0.95" />
        <circle cx="120" cy="186" r="7" fill={accent} opacity="0.95" />
      </g>

      {/* arms */}
      <g>
        <rect x="40" y="150" width="34" height="54" rx="16" fill={skin} />
        <rect x="166" y="150" width="34" height="54" rx="16" fill={skin} />
        <rect x="40" y="170" width="34" height="16" rx="8" fill="rgba(0,0,0,0.12)" />
        <rect x="166" y="170" width="34" height="16" rx="8" fill="rgba(0,0,0,0.12)" />
      </g>
    </g>
  );
}

export function ZeusAvatar({ size = 240, className }: AvatarProps) {
  return (
    <SvgWrap size={size} className={className}>
      <rect x="18" y="18" width="204" height="204" rx="28" fill="url(#bgGlowBlue)" />
      <ToyBase skin="#F7D7BD" tunic="#1E3A8A" belt="#EAB308" accent="#93C5FD" halo="#60A5FA" />

      {/* hair + beard */}
      <g filter="url(#softShadow)">
        <path
          d="M72 86 C76 56, 102 40, 120 40 C142 40, 166 54, 168 82
             C154 68, 138 62, 120 62 C102 62, 88 68, 72 86 Z"
          fill="#E5E7EB"
        />
        <path
          d="M84 126 C90 150, 108 160, 120 160 C132 160, 150 150, 156 126
             C148 130, 140 132, 120 132 C100 132, 92 130, 84 126 Z"
          fill="#E5E7EB"
        />
        {/* eyebrows */}
        <path d="M92 88 C98 80, 110 78, 118 84" stroke="#D1D5DB" strokeWidth="8" strokeLinecap="round" />
        <path d="M148 88 C142 80, 130 78, 122 84" stroke="#D1D5DB" strokeWidth="8" strokeLinecap="round" />
      </g>

      {/* lightning staff */}
      <g>
        <rect x="182" y="76" width="10" height="96" rx="5" fill="#D1D5DB" opacity="0.9" />
        <path
          d="M188 72 L170 104 L185 104 L165 142 L196 110 L182 110 Z"
          fill="#FDE047"
          stroke="#F59E0B"
          strokeWidth="3"
        />
      </g>

      {/* badge */}
      <g>
        <rect x="34" y="34" width="56" height="26" rx="13" fill="rgba(96,165,250,0.25)" stroke="rgba(147,197,253,0.45)" />
        <text x="62" y="52" textAnchor="middle" fontSize="12" fontWeight="900" fill="#E5E7EB" style={{ letterSpacing: "1px" }}>
          ⚡ ZEUS
        </text>
      </g>
    </SvgWrap>
  );
}

export function HerculesAvatar({ size = 240, className }: AvatarProps) {
  return (
    <SvgWrap size={size} className={className}>
      <rect x="18" y="18" width="204" height="204" rx="28" fill="url(#bgGlowGold)" />
      <ToyBase skin="#F3CBAA" tunic="#8B4513" belt="#F59E0B" accent="#FDE68A" halo="#FBBF24" />

      {/* hair */}
      <g filter="url(#softShadow)">
        <path
          d="M70 88 C72 62, 96 48, 120 48 C144 48, 168 62, 170 90
             C154 76, 140 70, 120 70 C100 70, 86 76, 70 88 Z"
          fill="#5B3A1E"
        />
        {/* beard */}
        <path
          d="M86 124 C90 150, 108 164, 120 164 C132 164, 150 150, 154 124
             C144 134, 134 140, 120 140 C106 140, 96 134, 86 124 Z"
          fill="#5B3A1E"
        />
      </g>

      {/* lion pelt shoulder */}
      <g filter="url(#softShadow)">
        <path
          d="M150 144 C170 144, 190 156, 190 176 C190 198, 166 206, 152 198
             C158 188, 154 178, 146 172 C142 168, 142 156, 150 144 Z"
          fill="#C0843D"
        />
        <circle cx="170" cy="170" r="10" fill="#B45309" opacity="0.9" />
        <circle cx="166" cy="168" r="2.2" fill="#111827" />
        <circle cx="174" cy="168" r="2.2" fill="#111827" />
      </g>

      {/* club */}
      <g>
        <rect x="38" y="90" width="20" height="104" rx="10" fill="#6B3F1D" />
        <circle cx="48" cy="92" r="16" fill="#7C4A25" />
        <circle cx="48" cy="92" r="6" fill="rgba(0,0,0,0.12)" />
      </g>

      {/* badge */}
      <g>
        <rect x="34" y="34" width="78" height="26" rx="13" fill="rgba(251,191,36,0.22)" stroke="rgba(253,230,138,0.45)" />
        <text x="73" y="52" textAnchor="middle" fontSize="12" fontWeight="900" fill="#E5E7EB" style={{ letterSpacing: "1px" }}>
          💪 HERC
        </text>
      </g>
    </SvgWrap>
  );
}

export function QuetzalcoatlAvatar({ size = 240, className }: AvatarProps) {
  return (
    <SvgWrap size={size} className={className}>
      <rect x="18" y="18" width="204" height="204" rx="28" fill="url(#bgGlowGreen)" />
      <ToyBase skin="#F2C7A0" tunic="#0F766E" belt="#22C55E" accent="#86EFAC" halo="#34D399" />

      {/* feather headdress */}
      <g filter="url(#softShadow)">
        <path
          d="M62 92 C70 56, 96 40, 120 40 C144 40, 172 56, 178 92
             C160 76, 144 68, 120 68 C96 68, 78 76, 62 92 Z"
          fill="#14532D"
          opacity="0.85"
        />
        {/* feathers */}
        {[
          { x: 78, y: 64, r: 18, c: "#22C55E" },
          { x: 98, y: 52, r: 18, c: "#60A5FA" },
          { x: 120, y: 46, r: 18, c: "#F59E0B" },
          { x: 142, y: 52, r: 18, c: "#EF4444" },
          { x: 162, y: 64, r: 18, c: "#A855F7" },
        ].map((f, i) => (
          <ellipse key={i} cx={f.x} cy={f.y} rx={f.r} ry={f.r + 8} fill={f.c} opacity="0.85" />
        ))}
      </g>

      {/* mask */}
      <g>
        <path
          d="M88 86 C96 76, 108 72, 120 72 C132 72, 144 76, 152 86
             C152 112, 140 126, 120 126 C100 126, 88 112, 88 86 Z"
          fill="#16A34A"
          opacity="0.9"
        />
        <path d="M104 98 L120 92 L136 98" stroke="#064E3B" strokeWidth="6" strokeLinecap="round" />
      </g>

      {/* serpent staff */}
      <g>
        <rect x="184" y="88" width="10" height="92" rx="5" fill="#14532D" opacity="0.9" />
        <path
          d="M188 88 C206 94, 206 112, 188 118 C170 124, 170 142, 188 148"
          stroke="#22C55E"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="196" cy="102" r="4" fill="#111827" />
      </g>

      {/* badge */}
      <g>
        <rect x="34" y="34" width="86" height="26" rx="13" fill="rgba(52,211,153,0.20)" stroke="rgba(134,239,172,0.45)" />
        <text x="77" y="52" textAnchor="middle" fontSize="12" fontWeight="900" fill="#E5E7EB" style={{ letterSpacing: "1px" }}>
          🪶 QUETZ
        </text>
      </g>
    </SvgWrap>
  );
}

