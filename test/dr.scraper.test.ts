import { buildDrProductUrl, buildDrSearchUrl, extractDrProductId, extractDrSearchResults, parseDrBookPage } from '../src/dr/scraper';

const BOOK_HTML = `
  <h1 class="fs-7 mb-0 js-text-prd-name">Hayvan &#199;iftliği</h1>
  <div class="row prd-detail-body" data-gtm='{"id": "1", "publisher":"Can Yayınları"}'></div>
  <ul class="nav js-list-prd-property">
    <li><strong> Yazar:</strong><span> George Orwell </span></li>
    <li><strong> Yayınevi:</strong><span> Can Yayınları - Çağdaş Dünya Yazarları Dizisi </span></li>
    <li><strong> İlk Baskı Yılı:</strong><span> 1945 </span></li>
    <li><strong> Sayfa Sayısı: </strong><span> 152 </span></li>
    <li><strong> Dil: </strong><span> Türkçe </span></li>
    <li><strong> Barkod:</strong><span> 9789750719387 </span></li>
  </ul>
  <div class="js-detail-product">Hayvanlar bir gün <b>ayaklanır</b>.<br>Sonra ne olur?</div>
  <script type="application/ld+json">
    {"@type": ["Product", "Book"], "name": "Hayvan Çiftliği", "author": [{"name": "George Orwell"}],
     "image": ["https://i.dr.com.tr/cache/600x600-0/originals/0000000105409-1.jpg"]}
  </script>
  <script type="application/ld+json">
    {"@type": "BreadcrumbList", "itemListElement": [
      {"item": {"name": "Kitap"}}, {"item": {"name": "Edebiyat"}}, {"item": {"name": "Roman"}}]}
  </script>
`;

describe('dr scraper', () => {
  it('parses a product page', () => {
    expect(parseDrBookPage(BOOK_HTML, '0000000105409')).toEqual({
      providerId: '0000000105409',
      title: 'Hayvan Çiftliği',
      authors: ['George Orwell'],
      publisher: 'Can Yayınları',
      seriesName: 'Çağdaş Dünya Yazarları Dizisi',
      description: 'Hayvanlar bir gün ayaklanır.\nSonra ne olur?',
      publishedYear: 1945,
      language: 'tr',
      pageCount: 152,
      isbn13: '9789750719387',
      genres: ['Edebiyat', 'Roman'],
      coverUrl: 'https://i.dr.com.tr/originals/0000000105409-1.jpg',
    });
  });

  it('parses JSON-LD whose description holds raw line breaks and still finds the cover', () => {
    const html = `<h1 class="js-text-prd-name">Kuma Daireler Çizen</h1>
      <script type="application/ld+json">{"@type": ["Product", "Book"], "name": "Kuma Daireler Çizen",
        "image": ["https://i.dr.com.tr/cache/600x600-0/originals/0002136846001-1.jpg"],
        "description": "Birinci satır
ikinci satır"}</script>`;
    expect(parseDrBookPage(html, '0002136846001').coverUrl).toBe('https://i.dr.com.tr/originals/0002136846001-1.jpg');
  });

  it('falls back to the cover file linked in the page when there is no usable JSON-LD', () => {
    const html = '<h1 class="js-text-prd-name">A</h1><img src="https://i.dr.com.tr/cache/500x400-0/originals/0002136846001-1.jpg">';
    expect(parseDrBookPage(html, '0002136846001').coverUrl).toBe('https://i.dr.com.tr/originals/0002136846001-1.jpg');
  });

  it('drops a description that only repeats the title', () => {
    const html = '<h1 class="js-text-prd-name">Kitap A</h1><div class="js-detail-product">Kitap A</div>';
    expect(parseDrBookPage(html, '1').description).toBeUndefined();
  });

  it('rejects an ISBN with a bad checksum', () => {
    const html =
      '<h1 class="js-text-prd-name">A</h1><ul class="js-list-prd-property"><li><strong>Barkod:</strong><span>9789750719380</span></li></ul>';
    expect(parseDrBookPage(html, '1').isbn13).toBeUndefined();
  });

  it('keeps only printed books from search results', () => {
    const html = `
      <div class="js-prd-item" data-id="A1" data-category="/kitap/roman"></div>
      <div class="js-prd-item" data-id="A2" data-ebook="true" data-category="/kitap/roman"></div>
      <div class="js-prd-item" data-id="A3" data-category="/oyuncak"></div>
      <div class="js-prd-item" data-id="A1" data-category="/kitap/roman"></div>
      <div class="js-prd-item" data-id="A4" data-category="/kitap/tarih"></div>`;
    expect(extractDrSearchResults(html, 10)).toEqual(['A1', 'A4']);
    expect(extractDrSearchResults(html, 1)).toEqual(['A1']);
  });

  it('extracts product ids from urls and bare ids', () => {
    expect(extractDrProductId('https://www.dr.com.tr/kitap/x/urunno=0000000105409')).toBe('0000000105409');
    expect(extractDrProductId('0000000105409')).toBe('0000000105409');
    expect(extractDrProductId('nope')).toBeUndefined();
  });

  it('builds urls', () => {
    expect(buildDrSearchUrl('hayvan çiftliği')).toBe('https://www.dr.com.tr/search?q=hayvan%20%C3%A7iftli%C4%9Fi');
    expect(buildDrProductUrl('12')).toBe('https://www.dr.com.tr/kitap/-/urunno=12');
  });
});
