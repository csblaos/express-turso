"use client";

import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Cloud,
  LayoutDashboard,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

const whatsappNumber = "8562077964565";
const whatsappMessage = encodeURIComponent(
  "ສະບາຍດີ / สวัสดีครับ สนใจใช้งาน POS O KhaiDee+ สำหรับร้านของฉัน กรุณาส่งรายละเอียดฟีเจอร์และแพ็กเกจให้ด้วยครับ",
);
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

const features = [
  {
    icon: ReceiptText,
    title: "ขายหน้าร้านได้คล่อง",
    description: "รับออเดอร์ คิดเงิน และออกบิลได้รวดเร็ว ลดขั้นตอนที่ทำให้ลูกค้าต้องรอ",
  },
  {
    icon: Boxes,
    title: "สต็อกที่เชื่อถือได้",
    description: "เห็นยอดคงเหลือและความเคลื่อนไหวของสินค้า ช่วยวางแผนเติมของได้แม่นยำขึ้น",
  },
  {
    icon: BarChart3,
    title: "รายงานพร้อมตัดสินใจ",
    description: "ติดตามยอดขาย สินค้าขายดี และภาพรวมร้านจากข้อมูลที่เข้าใจง่าย",
  },
  {
    icon: Store,
    title: "รองรับหลายสาขา",
    description: "จัดการสาขา ทีมงาน และข้อมูลร้านจากระบบเดียว พร้อมเติบโตไปกับธุรกิจ",
  },
  {
    icon: ClipboardList,
    title: "จัดซื้อเป็นระบบ",
    description: "สร้างและติดตามใบสั่งซื้อ พร้อมเชื่อมการรับสินค้าเข้ากับสต็อกของร้าน",
  },
  {
    icon: ShieldCheck,
    title: "กำหนดสิทธิ์ทีมงาน",
    description: "แยกบทบาทและสิทธิ์การเข้าถึง ให้แต่ละคนเห็นเฉพาะงานที่รับผิดชอบ",
  },
];

const businessTypes = [
  { icon: ShoppingBag, title: "ร้านค้าปลีก", detail: "สินค้า ราคา และสต็อกอยู่ในที่เดียว" },
  { icon: Store, title: "ร้านอาหาร", detail: "รับออเดอร์และจัดการคิวได้เป็นระบบ" },
  { icon: PackageCheck, title: "ร้านค้าหลายสาขา", detail: "ติดตามภาพรวมและทีมงานทุกสาขา" },
];

const steps = [
  { number: "01", title: "บอกเราเกี่ยวกับร้าน", text: "คุยผ่าน WhatsApp เพื่อให้เราเข้าใจประเภทธุรกิจและสิ่งที่ต้องการ" },
  { number: "02", title: "จัดเตรียมระบบ", text: "วางโครงสินค้า ผู้ใช้งาน และสาขาให้เหมาะกับวิธีทำงานของร้าน" },
  { number: "03", title: "เริ่มขายอย่างมั่นใจ", text: "ทดลองใช้งานกับทีม พร้อมคำแนะนำสำหรับการเริ่มต้นอย่างราบรื่น" },
];

const faqs = [
  ["ต้องติดตั้งโปรแกรมในเครื่องไหม?", "O KhaiDee+ เป็นระบบออนไลน์ เปิดใช้งานผ่านอุปกรณ์ที่เชื่อมต่ออินเทอร์เน็ตได้ โดยรายละเอียดอุปกรณ์ที่เหมาะสมสามารถปรึกษาทีมงานก่อนเริ่มใช้"],
  ["รองรับร้านที่มีหลายสาขาหรือไม่?", "รองรับการจัดการหลายสาขา พร้อมกำหนดทีมงานและสิทธิ์การใช้งานให้เหมาะกับแต่ละหน้าที่"],
  ["ข้อมูลร้านปลอดภัยแค่ไหน?", "ระบบมีการแยกสิทธิ์ผู้ใช้งานและออกแบบการเข้าถึงข้อมูลตามบทบาท เพื่อลดความเสี่ยงจากการเข้าถึงที่ไม่จำเป็น"],
  ["ขอดูตัวอย่างก่อนตัดสินใจได้ไหม?", "ได้เลย กดปุ่มคุยกับเราทาง WhatsApp เพื่อแจ้งประเภทร้านและนัดดูภาพรวมการใช้งาน"],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="O KhaiDee+ หน้าแรก">
          <img src="/okhaidee-logo.png" alt="โลโก้ O KhaiDee+" />
          <span>O KhaiDee<span>+</span></span>
        </a>
        <nav aria-label="เมนูหลัก">
          <a href="#features">ฟีเจอร์</a>
          <a href="#business">เหมาะกับใคร</a>
          <a href="#faq">คำถามที่พบบ่อย</a>
        </nav>
        <a className="button button-small" href={whatsappUrl} target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> คุยกับเรา
        </a>
      </header>

      <section className="hero section" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={16} /> POS สำหรับร้านยุคใหม่</div>
          <h1>ขายง่ายขึ้น<br />จัดการร้านได้<span>ครบกว่า</span></h1>
          <p className="hero-lead">O KhaiDee+ ช่วยรวมงานขาย สต็อก รายงาน และทีมงานไว้ในระบบเดียว ให้คุณมีเวลาโฟกัสกับสิ่งสำคัญ—การเติบโตของร้าน</p>
          <div className="hero-actions">
            <a className="button" href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={20} /> สนใจใช้งาน O KhaiDee+ <ArrowRight size={18} />
            </a>
            <a className="text-link" href="#features">ดูฟีเจอร์ทั้งหมด <ChevronRight size={17} /></a>
          </div>
          <div className="trust-row">
            <span><Check size={16} /> เริ่มต้นง่าย</span>
            <span><Check size={16} /> ใช้งานได้หลายอุปกรณ์</span>
            <span><Check size={16} /> พร้อมรองรับการเติบโต</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="ตัวอย่างหน้าจอภาพรวมร้าน">
          <div className="glow glow-one" />
          <div className="glow glow-two" />
          <div className="dashboard-window">
            <div className="window-bar"><span /><span /><span /><small>ภาพรวมร้านวันนี้</small></div>
            <div className="dashboard-body">
              <aside>
                <div className="mini-brand"><img src="/okhaidee-logo.png" alt="" /></div>
                {[LayoutDashboard, ReceiptText, Boxes, Users].map((Icon, i) => <div className={i === 0 ? "side-icon active" : "side-icon"} key={i}><Icon size={17} /></div>)}
              </aside>
              <div className="dashboard-content">
                <div className="dash-title"><span>ສະບາຍດີ 👋</span><small>ข้อมูลร้านแบบเรียลไทม์</small></div>
                <div className="stat-grid">
                  <div className="stat-card green"><CircleDollarSign size={19} /><small>ยอดขายวันนี้</small><strong>พร้อมติดตาม</strong><span>อัปเดตล่าสุด</span></div>
                  <div className="stat-card"><ReceiptText size={19} /><small>ออเดอร์</small><strong>จัดการง่าย</strong><span>ทุกช่องทาง</span></div>
                  <div className="stat-card"><Boxes size={19} /><small>สินค้าคงเหลือ</small><strong>เห็นชัดเจน</strong><span>แยกตามสาขา</span></div>
                </div>
                <div className="chart-card">
                  <div><strong>ภาพรวมยอดขาย</strong><small>7 วันที่ผ่านมา</small></div>
                  <div className="chart-bars">{[38, 54, 44, 72, 60, 82, 68, 91, 78, 100].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="floating-card sale"><Zap size={18} /><div><small>ระบบพร้อมใช้งาน</small><strong>ขายได้ต่อเนื่อง</strong></div></div>
          <div className="floating-card stock"><BadgeCheck size={19} /><div><small>จัดการสต็อก</small><strong>มั่นใจทุกการขาย</strong></div></div>
        </div>
      </section>

      <section className="proof-strip">
        <p>ระบบเดียวสำหรับงานหน้าร้านและหลังร้าน</p>
        <div><span><ReceiptText /> จุดขาย</span><span><Boxes /> สต็อก</span><span><BarChart3 /> รายงาน</span><span><Users /> ทีมงาน</span><span><Cloud /> ออนไลน์</span></div>
      </section>

      <section className="section features-section" id="features">
        <div className="section-heading">
          <div><span className="section-kicker">ทุกเรื่องร้าน จบในที่เดียว</span><h2>เครื่องมือที่ช่วยให้ร้าน<br />ทำงานได้<span>ฉลาดขึ้น</span></h2></div>
          <p>ลดงานซ้ำซ้อน เห็นข้อมูลสำคัญ และดูแลทีมได้ง่ายขึ้นตั้งแต่การขายครั้งแรกจนถึงการขยายสาขา</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="feature-card" key={title}><div className="icon-box"><Icon /></div><h3>{title}</h3><p>{description}</p><span>เรียนรู้เพิ่มเติม <ArrowRight size={15} /></span></article>
          ))}
        </div>
      </section>

      <section className="section business-section" id="business">
        <div className="business-copy">
          <span className="section-kicker light">ออกแบบมาเพื่อร้านที่อยากไปต่อ</span>
          <h2>ไม่ว่าร้านแบบไหน<br />ก็จัดการได้<span>เป็นระบบ</span></h2>
          <p>เริ่มจากร้านเดียวหรือกำลังขยายหลายสาขา O KhaiDee+ ช่วยวางพื้นฐานข้อมูลและการทำงานให้พร้อมเติบโต</p>
          <a className="button button-light" href={whatsappUrl} target="_blank" rel="noreferrer">เล่าเรื่องร้านของคุณ <MessageCircle size={19} /></a>
        </div>
        <div className="business-cards">
          {businessTypes.map(({ icon: Icon, title, detail }, index) => <article key={title}><div><Icon /></div><span>0{index + 1}</span><h3>{title}</h3><p>{detail}</p></article>)}
        </div>
      </section>

      <section className="section process-section">
        <div className="center-heading"><span className="section-kicker">เริ่มต้นโดยไม่ยุ่งยาก</span><h2>พร้อมใช้ใน <span>3 ขั้นตอน</span></h2><p>เราช่วยดูแลตั้งแต่ทำความเข้าใจร้านจนถึงวันที่ทีมเริ่มใช้งาน</p></div>
        <div className="steps">
          {steps.map((step, i) => <article key={step.number}><div className="step-number">{step.number}</div>{i < steps.length - 1 && <div className="step-line" />}<h3>{step.title}</h3><p>{step.text}</p></article>)}
        </div>
      </section>

      <section className="section faq-section" id="faq">
        <div className="faq-intro"><span className="section-kicker">คำถามที่พบบ่อย</span><h2>ก่อนเริ่มใช้งาน<br /><span>อยากรู้อะไร?</span></h2><p>หากยังมีคำถามอื่น ทีมงานยินดีให้รายละเอียดผ่าน WhatsApp</p><a className="text-link green-link" href={whatsappUrl} target="_blank" rel="noreferrer">ถามทีมงานโดยตรง <ArrowRight size={17} /></a></div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-shape one" /><div className="cta-shape two" />
        <div className="cta-logo"><img src="/okhaidee-logo.png" alt="" /></div>
        <div><span>พร้อมเปลี่ยนร้านให้จัดการง่ายขึ้นหรือยัง?</span><h2>ให้ O KhaiDee+ ช่วยดูแล<br />งานร้านในทุกวัน</h2><p>ส่งข้อความหาเรา พร้อมบอกประเภทร้าน ทีมงานจะติดต่อกลับพร้อมรายละเอียดที่เหมาะกับคุณ</p></div>
        <a className="button button-white" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={21} /> สนใจใช้งาน ติดต่อ WhatsApp</a>
      </section>

      <footer>
        <div className="footer-brand"><a className="brand" href="#top"><img src="/okhaidee-logo.png" alt="" /><span>O KhaiDee<span>+</span></span></a><p>ระบบ POS ที่ช่วยให้การขายและการจัดการร้านเป็นเรื่องง่าย</p></div>
        <div className="footer-links"><div><strong>ผลิตภัณฑ์</strong><a href="#features">ฟีเจอร์</a><a href="#business">ประเภทธุรกิจ</a><a href="#faq">คำถามที่พบบ่อย</a></div><div><strong>ติดต่อ</strong><a href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={15} /> +856 20 7796 4565</a><a href="#top"><Share2 size={15} /> แชร์ O KhaiDee+</a></div></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} O KhaiDee+. All rights reserved.</span><span>Built for better business in Laos 🇱🇦</span></div>
      </footer>

      <a className="whatsapp-float" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="ติดต่อ O KhaiDee+ ทาง WhatsApp"><MessageCircle /><span>คุยกับเรา</span></a>
    </main>
  );
}
