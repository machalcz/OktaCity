// Stránka s pravidly hry (otevírá se z menu Více, z horní lišty a z přihlašovací obrazovky).
const RULES_HTML = `
<h2>📖 Pravidla hry</h2>
<p class="lead">Hex Tycoon je logistická hra pro více hráčů na jedné sdílené mapě. Každý hráč řídí svou společnost: staví silnice a koleje, nakupuje vozidla a vozí zboží mezi městy a podniky. Hra běží v reálném čase, i když zrovna nejsi přihlášený, tvoje stavby a vozidla zůstávají na mapě.</p>

<h3>1. Mapa a místa</h3>
<ul>
<li><b>Města a vesnice</b> spotřebovávají zboží (mléko, maso, nábytek) a potřebují cement, aby rostla. Čím větší město, tím víc přípojek a víc provozu.</li>
<li><b>Podniky</b> (důl, lom, pila, farmy, jatka, cementárna, elektrárna…) zboží vyrábějí. Jsou to jednopolíčkové „tokeny“. Vozidla do nich zajedou, zmizí uvnitř (nakládka / vykládka) a pak zase vyjedou.</li>
<li><b>Ložiska, les a jezero</b> jsou místa, kde jde postavit těžbu: uhelný důl a lom jen na ložisku, těžba dřeva u lesa, čerpací stanice u jezera. Ostatní podniky se staví na volné místo s odstupem od ostatních.</li>
<li>Na začátku mapa žádného majitele nemá. Podniky jsou <b>nezávislé</b> a máš je k dispozici všichni.</li>
</ul>

<h3>2. Jak se staví silnice a koleje</h3>
<ol>
<li>Dole vyber <b>Silnice</b> nebo <b>Koleje</b>, klepni na pole a pak postupně na dva konektory (bílé kroužky na hranách). Tím je spojíš.</li>
<li>Bourání: nástroj <b>Bourat</b> (nebo klávesa X). Vrací se <b>50 %</b> ceny.</li>
<li>Přípojky měst a podniků jsou <b>pevné</b> (určuje je hra) a jsou jen na čtyřech rovných stranách (V, S, Z, J). Silnici veď až k bílému kroužku u tokenu. Další přípojka přibude až při povýšení.</li>
<li><b>Omezení:</b>
  <ul>
  <li>do jednoho pole smějí vést nejvýš <b>4 ramena</b>;</li>
  <li>v malé kostičce mezi osmiúhelníky lze stavět jen rovně;</li>
  <li>přes vodu jen <b>rovný most</b> přes celé pole (silniční 900 Kč, železniční 1 800 Kč);</li>
  <li>silnice a kolej se mohou křížit jen v rovném <b>přejezdu</b> (příplatek 400 Kč), na jedné hraně se ale nesmí napojit silnice na kolej;</li>
  <li>kdo má pole právě vybrané při stavbě, tomu je <b>zamknuté</b>: nikdo jiný ho nezmění. Zámek se uvolní zrušením výběru, nebo po 10 minutách nečinnosti.</li>
  </ul></li>
</ol>

<h3>3. Čí je silnice? Barvy na mapě</h3>
<ul>
<li>Každá silnice je <b>lemovaná barvou</b> toho, kdo ji postavil, koleje mají barevné okraje štěrkového lože. Podle toho při plánování trasy hned poznáš, kde budeš platit.</li>
<li>Silnice jsou <b>veřejné</b>: jezdit po nich smí kdokoli, ale po cizí silnici platíš majiteli <b>mýtné 3 Kč za každé pole</b> (po sdílené silnici se mýtné dělí mezi majitele). Po své vlastní jezdíš zadarmo.</li>
<li>Koleje jsou <b>výhradně majitelovy</b>. Po cizí trati vlak jezdit nemůže, takže mýtné nepřináší. Kolej se vyplatí rychlostí a kapacitou.</li>
<li>Když v poli postavíš jiné rameno silnice, stane se pole <b>sdílené</b> a mýto se dělí. Zbourat silnici smíš jen tam, kde ji nikdo jiný nevlastní.</li>
<li>Mýtné, které platíš ty i které platí tobě, najdeš ve <b>Společnost → Silnice a koleje</b> a v kartě vozidla (zaplacené mýto).</li>
</ul>

<h3>4. Vozidla a doprava</h3>
<ul>
<li>Vozidla se <b>kupují</b> v Obchodě a pak <b>nasazují</b> (Auto / Vlak v liště): vybereš místo A (nakládka), místo B (vykládka) a zboží. Z A se musí zboží vyrábět a B ho musí přijímat.</li>
<li><b>Druhy nákladu:</b> kryté vozy (zboží), sklápěče a otevřené vagony (sypké: uhlí, vápenec, dřevo, pelety, kukuřice), cisterny (voda).</li>
<li>Silniční vozidla: malý náklaďák 6 t, malý sklápěč 8 t, cisterna 14 t, kamion 16 t, kamion sklápěč 22 t. Vlak tvoří lokomotiva (I až IV, utáhne 2 / 4 / 7 / 10 vagonů) a vagony.</li>
<li>Do podniku se vejdou <b>2 vozidla na každou silniční přípojku</b> a 2 vlaky na kolej. Když je plno, ostatní čekají před vjezdem. Do města se vejde kdokoli.</li>
<li>Na přejezdech zastavují auta před zavřenými závorami. Cizí vozidla se na silnici mohou srazit (nehoda stojí opravu). Můžeš mít nejvýš <b>40 vozidel</b>.</li>
<li><b>Stárnutí:</b> po zhruba 25 minutách provozu přibývá poruch, vozidlo ztrácí výkon a nakonec může zaniknout. Provoz stojí malou částku za minutu (podle hodnoty a stáří vozidla).</li>
</ul>

<h3>5. Ekonomika</h3>
<ul>
<li>Začínáš s <b>35 000 Kč</b> a sadou vozidel (malý náklaďák, sklápěč, kamion, cisterna, 4 vagony a lokomotiva II).</li>
<li><b>Příjem z jízdy</b> = tuny × délka trasy (v polích) × sazba (silnice 3 Kč, kolej 2 Kč) × hodnota zboží. Peníze dostaneš při vykládce.</li>
<li><b>Nákup zboží:</b> když vozíš zboží z cizího podniku, zaplatíš jeho majiteli část hodnoty zboží (zhruba 1,5 Kč za tunu a jednotku hodnoty). Z nezávislého podniku je zboží zdarma.</li>
<li><b>Vstupné:</b> majitel podniku nebo starosta města určuje poplatek za vjezd (až 40 Kč za vozidlo / vagon). U podniku může cizím vjezd i <b>zakázat</b>.</li>
<li><b>Údržba:</b> každé tvoje rameno silnice stojí zhruba 1,1 Kč za minutu, kolej zhruba 3 Kč za minutu. Dlouhá síť se tedy musí uživit provozem.</li>
<li><b>Čekej pomalou návratnost:</b> jedno malé vozidlo na střední trase se i s postavenou silnicí zaplatí zhruba za 30 až 50 minut hraní. Velký kamion se vyplatí až na dlouhých trasách.</li>
<li><b>Elektrárna</b> spaluje uhlí nebo pelety a majiteli platí za elektřinu (0,9 Kč za jednotku). Města napojená na elektrárnu rostou rychleji.</li>
<li>Přehled příjmů a výdajů najdeš ve <b>Společnost → Finance</b>; kolik komu platíš nebo kolik platí tobě je u <b>Ostatních společností</b>.</li>
</ul>

<h3>6. Výrobní řetězce</h3>
<ul>
<li>Uhlí (důl) → <b>elektrárna</b> (elektřina). Pelety z pily umí elektrárnu také zásobovat.</li>
<li>Vápenec (lom) + uhlí → <b>cementárna</b> → cement pro růst měst.</li>
<li>Voda (čerpací stanice) → <b>farma – kukuřice</b> → <b>farma – zvířata</b> (+ voda) → maso (jatka) a mléko → města.</li>
<li>Dřevo (těžba) → <b>pila</b> → prkna a pelety → <b>výroba nábytku</b> → města.</li>
<li>Města spotřebovávají mléko a maso od vesnice výš, nábytek od malého města a potřebují cement k povýšení.</li>
</ul>

<h3>7. Vliv, majitelé a volby</h3>
<ul>
<li>Za každou nakládku a vykládku v místě získáváš <b>vliv</b>. Vliv s časem slábne (poločas zhruba 14 minut), takže je potřeba tam pravidelně jezdit.</li>
<li><b>Převzetí podniku:</b> nezávislý podnik můžeš převzít, jakmile tam máš vliv aspoň 60. Pak o něm rozhoduješ ty: vstupné, zákaz vjezdu, poměr výroby.</li>
<li><b>Postavit nový podnik</b> (Objekt) můžeš vždy jen na úrovni 1. Jako zakladatel tam máš hned velký vliv, ale konkurence ti ho časem může přebrat.</li>
<li><b>Povýšení</b> přidá přípojku a zrychlí odbavení. Podnik: 10 000 / 25 000 Kč a dost vlivu (150 / 300). Město: 15 000 / 40 000 / 90 000 Kč, musíš být starosta, město musí mít prosperitu a dostat cement.</li>
<li><b>Volby ve městech:</b> zhruba každých 6 minut se starostou stane ten, kdo má ve městě nejvíc vlivu (úřadující má malý náskok). Starosta nastavuje poplatek za vjezd a dostává příjem z provozu. Je-li poplatek vysoký (nad 12 Kč), město trpí a starosta ve volbách ztrácí body.</li>
<li><b>Volební kampaň</b> stojí 3 000 Kč a přidá 150 vlivu (potom 60 s pauza).</li>
<li>Ve své <b>domovské vesnici</b> máš od začátku vyšší vliv.</li>
</ul>

<h3>8. Přihlášení a hraní s přáteli</h3>
<ul>
<li>Při prvním vstupu založíš společnost (název, <b>heslo</b>, barva, domovská vesnice). V tom prohlížeči zůstaneš přihlášen.</li>
<li>Z jiného zařízení nebo později se přihlásíš <b>názvem společnosti a heslem</b>. Hra pokračuje tam, kde jsi skončil.</li>
<li>Svět pokračuje i bez tebe, dokud je ve hře aspoň jeden hráč online. Když nikdo online není, svět čeká.</li>
</ul>

<h3>Údržba, zrušení firmy a bankrot</h3>
<p>Za dálnice platíš jen mýtné za průjezd každým dílkem – dálnice nestojí údržbu a nikdy se nerozpadají. Rozestavěné a plánované úseky se časem dostaví samy (plánované nejdřív projdou fází výstavby).</p>
<p>Za <b>své silnice a koleje</b> platíš údržbu. Dokud firma funguje a údržbu platí, cesty se nerozpadají.</p>
<p>Firmu můžeš <b>zrušit</b> (Společnost → Zrušit společnost). Tvoje vozidla zmizí a tvoje cesty se stanou <b>neutrální</b> – nikdo je neudržuje, a tak postupně zmizí (každý kus v jinou dobu). Ostatním, kdo po nich jezdí, tím zmizí část nebo celá trasa a budou si ji muset dostavět za své.</p>
<p>Při dluhu <b>50 000 Kč</b> firma automaticky zbankrotuje a zanikne – stejně jako při zrušení. Ty to jen potvrdíš, abys věděl, že skončila a že si musíš založit novou.</p>

<h3>Ovládání</h3>
<p>Tahem posouváš mapu, dvěma prsty (nebo kolečkem) přibližuješ. Klepnutím vybereš pole, token nebo své vozidlo. Na počítači: 1 / 2 = silnice / koleje, X = bourání, B = objekty, C = společnost, Q / E = otáčení, V = pohled.</p>
`;
function showRules() {
  let box = document.getElementById('rules');
  if (!box) {
    box = document.createElement('div'); box.id = 'rules';
    box.innerHTML = '<div class="rbox"><button class="rclose" aria-label="Zavřít">✕</button><div class="rbody"></div></div>';
    box.addEventListener('click', e => { if (e.target === box || e.target.closest('.rclose')) box.classList.add('hidden'); });
    document.body.appendChild(box);
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.classList.contains('hidden')) { box.classList.add('hidden'); e.stopPropagation(); } }, true);
  }
  box.querySelector('.rbody').innerHTML = RULES_HTML; box.querySelector('.rbody').scrollTop = 0;
  box.classList.remove('hidden');
}
