type BrandMarkProps = {
  className?: string;
};

export default function BrandMark({ className = 'w-10 h-10' }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 220 220" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="MAPLE RENTALS Logo" role="img">
      <circle cx="110" cy="110" r="104" fill="#0F2747" stroke="#D8DEE8" strokeWidth="8" />
      <path
        d="M70 84L87 72L95 57L110 74L128 62L135 76L153 73L145 89"
        stroke="#D9BE7B"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M42 120C58 110 78 107 96 108H150C166 108 178 106 188 102"
        stroke="#DCE3EF"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M57 122C53 130 61 138 70 136" stroke="#DCE3EF" strokeWidth="4" strokeLinecap="round" />
      <path d="M173 114C177 122 169 132 160 131" stroke="#DCE3EF" strokeWidth="4" strokeLinecap="round" />
      <text x="110" y="157" textAnchor="middle" fill="#D9BE7B" fontSize="28" fontWeight="700" fontFamily="Georgia, serif" letterSpacing="1.5">
        MAPLE
      </text>
      <text x="110" y="182" textAnchor="middle" fill="#D9BE7B" fontSize="18" fontWeight="700" fontFamily="Georgia, serif" letterSpacing="1.2">
        RENTALS
      </text>
    </svg>
  );
}
