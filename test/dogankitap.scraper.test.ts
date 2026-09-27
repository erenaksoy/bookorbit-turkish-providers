import {
  buildDoganKitapBookUrl,
  buildDoganKitapSearchBody,
  extractDoganKitapAuthorBooks,
  extractDoganKitapSlug,
  parseDoganKitapBookPage,
  parseDoganKitapSearchResults,
} from '../src/dogankitap/scraper';

const BOOK_HTML = `
  <div class="kd-detay">
    <div class="kd-baslik">ANNA Karenina</div>
    <div class="kd-baslik"><span>Soft Cover</span></div>
    <div class="kd-yazar"><a href="/yazar/lev-n-tolstoy">Lev N. Tolstoy</a></div>
    <div class="kd-cevirmen">Çeviren: Özlem Asiltürk</div>
  </div>
  <div class="kd-kunye"><h4 class="icbaslik">Kitap Künyesi:</h4><p>Barkod: 9786255683106</p><p>Sayfa Sayısı: 1072</p>
    <p>Ebat: 13.5x19.5 cm</p><p>Yayın Tarihi: Ağustos 2025</p><p>Kategori: Romanlar, Klasikler</p><p class="hidden">Orijinal Dili: Türkçe</p></div>
  <div class="kd-aciklama"><p>Birinci paragraf.</p><p>İkinci paragraf.</p></div>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Book","name":"ANNA Karenina",
    "author":{"@type":"Person","name":"Lev N. Tolstoy"},"isbn":"9786255683106","numberOfPages":"1072","datePublished":"2025",
    "image":"https://www.dogankitap.com.tr/files/kitaplar/img/anna-karenina-kapak-o.jpg","publisher":{"@type":"Organization","name":""},
    "genre":"Romanlar, Klasikler"}</script>
`;

describe('dogankitap scraper', () => {
  it('parses a book page', () => {
    expect(parseDoganKitapBookPage(BOOK_HTML, 'anna-karenina')).toEqual({
      providerId: 'anna-karenina',
      title: 'ANNA Karenina',
      authors: ['Lev N. Tolstoy'],
      publisher: 'Doğan Kitap',
      description: 'Birinci paragraf.\nİkinci paragraf.',
      publishedYear: 2025,
      pageCount: 1072,
      isbn13: '9786255683106',
      genres: ['Romanlar', 'Klasikler'],
      coverUrl: 'https://www.dogankitap.com.tr/files/kitaplar/img/anna-karenina-kapak-o.jpg',
    });
  });

  it('falls back to the structured data, and reads the "DK" publisher as Doğan Kitap', () => {
    const html = `<script type="application/ld+json">{"@type":"Book","name":"Serenad","author":{"name":"Zülfü Livaneli"},
      "isbn":"9786050900286","numberOfPages":"484","datePublished":"2011","publisher":{"name":"DK"},"genre":"Romanlar"}</script>`;
    expect(parseDoganKitapBookPage(html, 'serenad')).toMatchObject({
      title: 'Serenad',
      authors: ['Zülfü Livaneli'],
      publisher: 'Doğan Kitap',
      publishedYear: 2011,
      pageCount: 484,
      isbn13: '9786050900286',
      genres: ['Romanlar'],
    });
  });

  it('keeps an imprint the page names', () => {
    const html = '<script type="application/ld+json">{"@type":"Book","name":"A","publisher":{"name":"Doğan Solo"}}</script>';
    expect(parseDoganKitapBookPage(html, 'a').publisher).toBe('Doğan Solo');
  });

  it('splits search results into books and authors, dropping events and repeats', () => {
    const data = [
      { baslik: "Suç ve Ceza / Zülfü Livaneli'nin önsözüyle", link: '/kitap/suc-ve-ceza', tip: 'Kitap' },
      { baslik: "Suç Ve Ceza / Zülfü Livaneli'nin Önsözüyle", link: '/kitap/suc-ve-ceza', tip: 'Kitap' },
      { baslik: 'Zülfü Livaneli', link: '/yazar/zulfu-livaneli', tip: 'Yazar' },
      { baslik: 'Zülfü Livaneli İmza Günü', link: '/etkinlik/zulfu-livaneli-imza-gunu', tip: 'Etkinlik' },
      { baslik: 'Kötü', link: '/kitap/../../x', tip: 'Kitap' },
    ];
    expect(parseDoganKitapSearchResults(data)).toEqual({
      books: [{ slug: 'suc-ve-ceza', name: "Suç ve Ceza / Zülfü Livaneli'nin önsözüyle" }],
      authors: [{ slug: 'zulfu-livaneli', name: 'Zülfü Livaneli' }],
    });
    expect(parseDoganKitapSearchResults({ error: true })).toEqual({ books: [], authors: [] });
  });

  it('lists the books on an author page', () => {
    const html = `
      <div class="kitapitem"><a href="/kitap/serenad-ciltli"><img src="x.jpg" alt="Serenad (Ciltli)" /></a></div>
      <div class="kitapitem"><a href="/kitap/serenad"><img src="y.jpg" alt="Serenad" /></a></div>
      <div class="kitapitem"><a href="https://www.dogankitap.com.tr/kitap/serenad"><img src="y.jpg" alt="Serenad" /></a></div>
      <div class="kitapitem"><a href="/etkinlik/imza"><img src="z.jpg" alt="İmza" /></a></div>`;
    expect(extractDoganKitapAuthorBooks(html)).toEqual([
      { slug: 'serenad-ciltli', name: 'Serenad (Ciltli)' },
      { slug: 'serenad', name: 'Serenad' },
    ]);
  });

  it('extracts slugs from urls and bare slugs', () => {
    expect(extractDoganKitapSlug('https://www.dogankitap.com.tr/kitap/serenad')).toBe('serenad');
    expect(extractDoganKitapSlug('serenad')).toBe('serenad');
    expect(extractDoganKitapSlug('../serenad')).toBeUndefined();
  });

  it('builds requests', () => {
    expect(buildDoganKitapSearchBody('Suç ve Ceza')).toBe('type=aramasonuclari&kelime=Su%C3%A7+ve+Ceza');
    expect(buildDoganKitapBookUrl('serenad')).toBe('https://www.dogankitap.com.tr/kitap/serenad');
  });
});
