function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const v = Number(part);
    if (!/^\d+$/.test(part) || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// IPv4 only (the home network and the VPN are IPv4); IPv4-mapped IPv6 addresses are unwrapped.
export function ipInCidrs(ip: string, cidrs: string[]): boolean {
  const addr = ipv4ToInt(ip.replace(/^::ffff:/, ''));
  if (addr === null) return false;
  return cidrs.some((cidr) => {
    const [base, bitsStr = '32'] = cidr.split('/');
    const baseInt = ipv4ToInt(base ?? '');
    const bits = Number(bitsStr);
    if (baseInt === null || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((addr & mask) >>> 0) === ((baseInt & mask) >>> 0);
  });
}
