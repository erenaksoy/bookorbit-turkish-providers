import {
  buildNezihProductUrl,
  buildNezihSearchUrl,
  buildNezihTitleQueries,
  extractNezihSearchResults,
  extractNezihSlug,
  filterNezihResultsByTitle,
  parseNezihBookPage,
} from '../src/nezih/scraper';

const BOOK_HTML = `
  <ul class="fl breadcrumb" itemscope="" itemtype="https://schema.org/BreadcrumbList">
    <li><a href="/"><span itemprop="name">Anasayfa</span></a></li>
    <li><a href="/kitap"><span itemprop="name">Kitap</span></a></li>
    <li><a href="/edebiyat"><span itemprop="name">Edebiyat</span></a></li>
    <li><a href="/dunya-klasikler"><span itemprop="name">Dünya Klasikler</span></a></li>
  </ul>
  <h1 class="fl col-12" id="productName" >Sefiller (Kısaltılmış Metin)</h1>
  <div id="productCode"> Ürün barkodu: 9786052959756 </div>
  <div class="col col-12" id="productText">
    <div class="fl col-12 authorText"> <p><p><strong>Yazar:</strong> Victor Hugo</p> </div>
  </div>
  <div class="fl col-12" id="productDetailTab"> <h2>Sefiller (Kısaltılmış Metin)</h2> <p>Birinci paragraf.</p><p>İkinci <br />satır.</p> </div>
  <script type="application/ld+json">{"@context":"https:\\/\\/schema.org","@type":["Product","Book"],"name":"Sefiller (Kısaltılmış Metin)",
    "image":["https:\\/\\/www.nezih.com.tr\\/sefiller-kisaltilmis-metin-169016-87-O.jpg"],"inLanguage":"Turkish",
    "numberOfPages":"14:30 a kadar verilen siparişlerde aynı gün kargoya verilir.","description":"Düz metin.",
    "isbn":"9786052959756","publisher":{"@type":"Organization","name":"İş Bankası Kültür Yayınları"},"author":{"@type":"Person","name":"GENEL"}}</script>
`;

function productData(fields: Record<string, string>): string {
  const literal = JSON.stringify(fields)
    .replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `<script>PRODUCT_DATA.push(JSON.parse('${literal}'));</script>`;
}

const SEARCH_HTML = [
  productData({ id: '87153', name: 'Sefiller (Kısaltılmış Metin)', url: 'sefiller-kisaltilmis-metin', category_path: 'Kitap > Edebiyat > ' }),
  productData({ id: '1', name: 'Sefiller Temalı Defter', url: 'sefiller-defter', category_path: 'Kırtasiye > Defterler > ' }),
  productData({ id: '55320', name: 'Sefiller', url: 'sefiller-55320', category_path: 'Kitap > Edebiyat > ' }),
  productData({ id: '2', name: 'Hayvanlar Mandala', url: 'hayvanlar-mandala', category_path: 'Kitap > Çocuk Kitapları > ' }),
  productData({ id: '55320', name: 'Sefiller', url: 'sefiller-55320', category_path: 'Kitap > Edebiyat > ' }),
].join('\n');

describe('nezih scraper', () => {
  it('parses a product page, preferring the page over its placeholder structured data', () => {
    expect(parseNezihBookPage(BOOK_HTML, 'sefiller-kisaltilmis-metin')).toEqual({
      providerId: 'sefiller-kisaltilmis-metin',
      title: 'Sefiller (Kısaltılmış Metin)',
      authors: ['Victor Hugo'],
      publisher: 'İş Bankası Kültür Yayınları',
      description: 'Birinci paragraf.\nİkinci\nsatır.',
      language: 'tr',
      isbn13: '9786052959756',
      genres: ['Edebiyat', 'Dünya Klasikler'],
      coverUrl: 'https://www.nezih.com.tr/sefiller-kisaltilmis-metin-169016-87-O.jpg',
    });
  });

  it('falls back to the barcode line and the structured description', () => {
    const html = `<h1 id="productName">A</h1><div id="productCode"> Ürün barkodu: 9789759099077 </div>
      <script type="application/ld+json">{"@type":["Product","Book"],"name":"A","description":"Düz metin."}</script>`;
    expect(parseNezihBookPage(html, 'a')).toMatchObject({ isbn13: '9789759099077', description: 'Düz metin.' });
  });

  it('drops a description that only repeats the title or the publisher', () => {
    const page = (text: string) => `<h1 id="productName">Sefiller</h1><div id="productDetailTab"><h2>Sefiller</h2><p>${text}</p></div>
      <script type="application/ld+json">{"@type":["Product","Book"],"name":"Sefiller","publisher":{"name":"Can Yayınları"}}</script>`;
    expect(parseNezihBookPage(page('Can Yayınları'), 'sefiller').description).toBeUndefined();
    expect(parseNezihBookPage(page('Sefiller'), 'sefiller').description).toBeUndefined();
    expect(parseNezihBookPage(page('Bir roman.'), 'sefiller').description).toBe('Bir roman.');
  });

  it('keeps only books from search results, once each', () => {
    expect(extractNezihSearchResults(SEARCH_HTML)).toEqual([
      { slug: 'sefiller-kisaltilmis-metin', name: 'Sefiller (Kısaltılmış Metin)' },
      { slug: 'sefiller-55320', name: 'Sefiller' },
      { slug: 'hayvanlar-mandala', name: 'Hayvanlar Mandala' },
    ]);
  });

  it('keeps results holding every title word, the exact name first', () => {
    const results = extractNezihSearchResults(SEARCH_HTML);
    expect(filterNezihResultsByTitle(results, 'Sefiller', 5)).toEqual(['sefiller-55320', 'sefiller-kisaltilmis-metin']);
    expect(filterNezihResultsByTitle(results, 'Sefiller', 1)).toEqual(['sefiller-55320']);
    expect(filterNezihResultsByTitle(results, 'Hayvan Çiftliği', 5)).toEqual([]);
  });

  it('never puts the author into a query', () => {
    expect(buildNezihTitleQueries('Victor Hugo - Sefiller', 'Victor Hugo')).toEqual(['Sefiller']);
    expect(buildNezihTitleQueries('Victor Hugo - Sefiller', undefined)).toEqual(['Sefiller', 'Victor Hugo']);
    expect(buildNezihTitleQueries('Sefiller', 'Victor Hugo')).toEqual(['Sefiller']);
    expect(buildNezihTitleQueries('  ', undefined)).toEqual([]);
  });

  it('extracts slugs from urls and bare slugs', () => {
    expect(extractNezihSlug('https://www.nezih.com.tr/sefiller-55320')).toBe('sefiller-55320');
    expect(extractNezihSlug('sefiller-55320')).toBe('sefiller-55320');
    expect(extractNezihSlug('../etc/passwd')).toBeUndefined();
  });

  it('builds urls', () => {
    expect(buildNezihSearchUrl('9786052959756')).toBe('https://www.nezih.com.tr/arama?q=9786052959756');
    expect(buildNezihProductUrl('sefiller-55320')).toBe('https://www.nezih.com.tr/sefiller-55320');
  });
});
