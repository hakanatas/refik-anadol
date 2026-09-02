# Akışkan Tür Haritası: Konsept

## Sergi metni (taslak)

Bu duvarda gördüğünüz her ışık parçası, Türkiye'de bir canlının kaydedildiği andır.
Bir kuş gözlemcisinin defterine yazdığı bir leylek, bir botanikçinin kuruttuğu bir
orkide, bir öğrencinin telefonuyla çektiği bir kelebek. 1950'den bugüne yüz binlerce
böyle an, bir veri tabanında yan yana bekliyor.

Biz bu anları serbest bıraktık. Her kayıt, yapıldığı yerde doğar; görünmez bir
rüzgarla sürüklenir, iz bırakır ve söner. Renk canlının ailesini söyler: mavi
kuşlar, yeşil bitkiler, amber böcekler, kızıl memeliler. Işığın biriktiği yerde
çeşitlilik yoğundur. Karadeniz kıyısı bir nehir gibi akar; İç Anadolu seyrek
ve sessizdir.

Zaman aktıkça ekran dolar. Ama dikkat: artan şey türler değil, onları görenlerdir.
Son yirmi yılda cep telefonlarımız birer doğa defterine dönüştü ve kayıtlar
katlandı. Bu harita biyoçeşitliliğin haritası olduğu kadar, bakmayı öğrenen
bir toplumun da haritasıdır.

## Algoritmik yaklaşım

**Veri fırça olur.** Görüntü elle çizilmez; gözlem kayıtları ekranda parçacıklara
dönüşür. Sanatçının işi, bu parçacıkların uyacağı kuralları koymaktır: nerede
doğacaklar, hangi kuvvetler onları sürükleyecek, ne kadar yaşayacaklar. Sonuç
her seferinde biraz farklıdır ama aynı tohum aynı akışı yeniden üretir.

**Akış alanı.** Ekran görünmez bir rüzgar haritasıyla örtülüdür. Bu harita Perlin
gürültüsünden üretilir: yakın noktalar benzer yöne, uzak noktalar farklı yöne eser.
Zamanla yavaşça değişir. Parçacıklar bu rüzgara kapılır ama doğdukları yere bağlı
zayıf bir yayla geri çekilir. Böylece harita dağılmaz, nefes alır.

**İz ve solma.** Her kare tamamen silinmez; geçmiş kareler hafifçe soldurulur.
Parçacığın geçtiği yol bir süre görünür kalır. Nokta bulutu yerine fırça darbesi
gibi bir doku doğar.

**Ekleme karışımı.** Üst üste binen parçacıkların renkleri toplanır, beyaza yaklaşır.
Yoğunluğu sayıyla değil ışıkla anlatırız. Çok parçacık varken tek parçacığın
saydamlığı düşürülür; harita hiç tamamen beyaza doymaz, renkler okunur kalır.

**Zaman ekseni.** Yıllar sırayla akar. Her yıl o yılın kayıtları doğar; canlı parçacık
sayısı o ana kadarki toplam gözlemle orantılı büyür. 1950'de neredeyse boş bir ekran,
2020'lerde dolup taşan bir harita. Döngü sonunda kısa bir bekleme, sonra yeniden başlar.

## Refik Anadol'la ilişki ve fark

Anadol'un yöntemi: büyük bir arşiv, makine öğrenmesi, mekanı kaplayan ekran.
Biz aynı üç adımı takım ölçeğine indiriyoruz: açık bir arşiv (GBIF), algoritmik
bir görselleştirme (p5.js), tek bir projeksiyon duvarı. Onun işlerini kopyalamıyoruz;
özgün veri kümemiz ve kendi kurallarımız var. Esin kaynağımız yöntem, konumuz
Türkiye'nin canlıları.

## FTC bağlantısı

Robot, sergiye veri toplayan bir araç olarak katılır: sıcaklık, nem, ışık, ses.
Bu veriler aynı formata dönüştürülüp haritaya canlı bir katman olarak eklenebilir.
Sunumda cümle şudur: "Robotumuz sanatın fırçası, veri boyası, duvar tuvali."
