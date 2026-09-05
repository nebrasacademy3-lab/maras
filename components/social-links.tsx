import { AtSign, Facebook, Ghost, Instagram, Linkedin, MessageCircle, Music2, Send, Youtube } from "lucide-react";
import { normalizedSocialLinks, type SocialChannelId, type SocialSettingsInput } from "@/lib/social-links";

export function SocialIcon({ id, size = 18 }: { id: SocialChannelId; size?: number }) {
  if (id === "x") return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l7.9-9L.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L6.3 4H4.5l13.3 16Z" /></svg>;
  const Icon = { whatsapp: MessageCircle, instagram: Instagram, tiktok: Music2, youtube: Youtube, telegram: Send, linkedin: Linkedin, facebook: Facebook, snapchat: Ghost, threads: AtSign }[id];
  return <Icon size={size} aria-hidden="true" />;
}

export function SocialLinks({ settings, className = "socials", labels = false, includeWhatsapp = true }: { settings: SocialSettingsInput; className?: string; labels?: boolean; includeWhatsapp?: boolean }) {
  const links = normalizedSocialLinks(settings).filter((link) => includeWhatsapp || link.id !== "whatsapp");
  if (!links.length) return null;
  return <div className={className} role="group" aria-label="قنوات مراس الرسمية">{links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.labelAr} — مراس العلم`} title={link.labelAr}><SocialIcon id={link.id} />{labels ? <span>{link.labelAr}</span> : null}</a>)}</div>;
}
