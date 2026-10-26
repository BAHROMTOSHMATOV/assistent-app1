# 🎙 Yordamchi — Claude asosidagi shaxsiy ovozli yordamchi

Siri'ga o'xshash yordamchi. U telefonda (Android, iPhone) va Windows kompyuterda ishlaydi.
Unga oddiy gapirasiz yoki yozasiz, u Claude yordamida gapingizni tushunadi, vazifa va uchrashuvlaringizni yozib boradi va vaqti kelganda eslatadi.

## Nimalar qila oladi

- 🎙 **Ovoz bilan boshqarish.** Mikrofonni (yoki sharni) bosing va gapiring: *"Ertaga soat 14 da Ali bilan uchrashuvim bor, shartnomani olib borishim kerak"*. Yordamchi uchrashuvni yozib qo'yadi va 15 daqiqa oldin eslatadi.
- ⏰ **Eslatmalar.** Kompyuter yoki telefonda bildirishnoma chiqadi, yordamchi eslatmani ovoz chiqarib ham o'qiydi.
- ☀️ **Ertalabki brifing.** Har kuni belgilangan vaqtda bugungi rejani, muddati o'tgan ishlarni aytadi va bitta maslahat beradi.
- 💬 **Savollarga javob.** *"Bugun nima ishlarim bor?"*, *"Shu hafta uchun reja tuzib ber"*, *"Hisobotni topshirdim"* deyishingiz mumkin, u tushunadi.
- 🧠 **Xotira.** Siz haqingizdagi muhim narsalarni (odamlar, loyihalar, odatlar) eslab qoladi.
- 📋 **Vazifalar ro'yxati.** Chap yuqoridagi tugma orqali ochiladi. Vazifani u yerda bajarilgan deb belgilash yoki qo'lda qo'shish mumkin.
- Barcha ma'lumotlar **faqat sizning qurilmangizda** saqlanadi.

## Kerakli narsa: Claude API kaliti

1. <https://console.anthropic.com> saytiga kiring va ro'yxatdan o'ting.
2. **Billing** bo'limida hisobni to'ldiring (boshlash uchun 5 $ yetadi). **Limits** bo'limida oylik chegara ham qo'ying.
3. **API Keys → Create Key** ni bosing va kalitni nusxalang (u `sk-ant-...` bilan boshlanadi).
4. Ilovani birinchi marta ochganingizda kalitni kiritib, **Saqlash** ni bosing.

Taxminiy xarajat: kuniga 20–30 ta xabar yuborilsa, **Opus 5.5** (eng aqlli) bilan oyiga taxminan 15–30 $, **Sonnet 5.5** bilan taxminan 2 baravar arzon, **Haiku 5.5** bilan oyiga 1 $ atrofida chiqadi. Modelni sozlamalarda almashtirish mumkin.

## Internetga qo'yish (GitHub'siz)

1. <https://app.netlify.com/drop> saytini oching (bepul, ro'yxatdan o'tish mumkin).
2. `yordamchi.zip` faylini oching (sichqonchaning o'ng tugmasi → **Extract All / Hammasini chiqarish**) va hosil bo'lgan `yordamchi` papkasini sahifaga sudrab tashlang.
3. Bir necha soniyada `https://....netlify.app` ko'rinishidagi manzil beriladi. Shu manzilni telefonda ham, kompyuterda ham oching.

## O'rnatish

| Qurilma | Qanday qilinadi |
|---|---|
| **Windows** (Edge yoki Chrome) | Manzil satridagi ⊕ **"Ilovani o'rnatish"** belgisini bosing. Ilova Start menyusida paydo bo'ladi. |
| **Android** (Chrome) | ⋮ menyusi → **"Ilovani o'rnatish"**. |
| **iPhone** (Safari) | Ulashish ⬆️ → **"Bosh ekranga qo'shish"**. |

Keyin **Sozlamalar → Eslatmalar → "Ruxsat berish"** ni bosing.

## Bilib qo'ying

- Eslatmalar ilova (yoki brauzer) **fonda ochiq turganda** keladi. Kompyuterda ilovani yopmang, shunchaki kichraytirib qo'ying.
- O'zbekcha **ovozli kiritish** Chrome va Edge'da ishlaydi. iPhone'da tugmani bosib gapirish o'rniga klaviaturadagi 🎤 diktovkadan foydalaning.
- **Ovozli javob** uchun qurilmada o'zbekcha ovoz bo'lishi kerak. Agar yo'q bo'lsa, sozlamalarda turkcha (tr-TR) ovozni tanlang, u o'zbekcha matnni tushunarli o'qiydi.
- Telefon va kompyuterdagi ma'lumotlar o'zi moslashmaydi: **Sozlamalar → Ma'lumotlar → Saqlash / Yuklash** orqali ko'chiriladi.
- Kompyuterda **Ctrl+M** tugmasi mikrofonni yoqadi.
