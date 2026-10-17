import { ArrowUpLeft, Plane, Globe2, Check, ScanLine } from "lucide-react";

/** Original flat travel collage: evocative artwork, not a real visa or document. */
export function TravelArt() {
  return (
    <div className="travel-art" aria-hidden="true">
      <div className="art-grid" />
      <span className="art-coordinate">A NEW CHAPTER / 01</span>
      <div className="postcard">
        <div className="postcard-top">
          <span>یک مقصد تازه، یک داستان تازه</span>
          <span>NYC ↗</span>
        </div>
        {/* An original skyline adds visual storytelling without a heavy 3D runtime. */}
        <svg className="city-illustration" viewBox="0 0 500 340" fill="none">
          <defs>
            <linearGradient id="sky" x2="0" y2="1">
              <stop stopColor="#e9ede2" />
              <stop offset="1" stopColor="#f8ead5" />
            </linearGradient>
            <pattern
              id="windows"
              width="14"
              height="18"
              patternUnits="userSpaceOnUse"
            >
              <rect
                x="5"
                y="5"
                width="4"
                height="7"
                fill="#e9e6d8"
                opacity=".65"
              />
            </pattern>
          </defs>
          <rect width="500" height="340" fill="url(#sky)" />
          <circle cx="353" cy="90" r="48" fill="#f1bd7b" />
          <path
            d="M0 252 20 242H45V182H81V220H107V152H138V244H165V203H205V174H240V230H275V154H311V206H340V178H373V226H404V168H433V230H470V194H500V340H0Z"
            fill="#b4c1ae"
          />
          <path
            d="M0 282H33V221H80V280H103V175H146V280H164V133H170V112H179V79H185V112H194V133H201V280H229V198H278V280H300V144H350V280H370V214H410V280H437V185H481V280H500V340H0Z"
            fill="#6e8c7c"
          />
          <path
            d="M103 175H146V280H103Z M164 133H201V280H164Z M300 144H350V280H300Z M437 185H481V280H437Z"
            fill="url(#windows)"
          />
          <path
            d="M19 298H57V253H100V298H127V227H166V298H209V247H253V298H283V213H322V298H356V242H398V298H428V260H468V298H500V340H0Z"
            fill="#345f51"
          />
          <path
            d="M0 315C100 302 144 333 249 317S421 301 500 315V340H0Z"
            fill="#23493e"
          />
          <g stroke="#f2eee0" strokeWidth="2" opacity=".45">
            <path d="M136 240v48m10-48v48m73-29v38m10-38v38m66-72v67m11-67v67m59-42v42m11-42v42" />
          </g>
          <path
            d="m42 96 28-7 9-26 8 3-3 26 21 13-2 6-24-5-9 10-5-2 4-15-26 4Z"
            fill="#f8f6eb"
          />
          <path
            d="M110 103c58 19 67-63 127-36"
            stroke="#faf8ed"
            strokeWidth="2"
            strokeDasharray="4 5"
          />
        </svg>
        <div className="postcard-footer">
          <span>فصل بعدی زندگی شما</span>
          <ArrowUpLeft size={22} />
        </div>
      </div>
      <div className="journey-ticket">
        <span className="ticket-icon">
          <Globe2 size={23} strokeWidth={1.3} />
        </span>
        <div>
          <small>از یک تصمیم کوچک</small>
          <strong>تا یک شروع تازه</strong>
        </div>
        <div className="ticket-perforation" />
        <Plane size={22} strokeWidth={1.4} />
      </div>
      <div className="document-card">
        <div className="document-icon">
          <ScanLine size={23} />
        </div>
        <span>قدم‌به‌قدم، کنار شما</span>
        <div className="document-row">
          <i />
          <span />
          <Check size={15} />
        </div>
        <div className="document-row">
          <i />
          <span />
          <Check size={15} />
        </div>
        <div className="document-row">
          <i />
          <span />
          <Check size={15} />
        </div>
      </div>
      <div className="hero-plane">
        <Plane strokeWidth={1.2} />
      </div>
      <svg className="flight-path" viewBox="0 0 500 500">
        <path
          d="M40 420C-20 260 330 500 409 245S120 42 238 98"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeDasharray="5 7"
        />
      </svg>
      <span className="art-bottom-note">
        <span /> EVERY JOURNEY BEGINS WITH A STEP
      </span>
    </div>
  );
}
