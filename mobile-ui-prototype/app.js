// ساده‌ترین تعامل‌ها: منو، مودال جستجو، ناوبری پایین
const menuBtn = document.getElementById('menuBtn');
const drawer = document.getElementById('drawer');
const drawerClose = document.getElementById('drawerClose');
const searchBtn = document.getElementById('searchBtn');
const searchModal = document.getElementById('searchModal');
const closeSearch = document.getElementById('closeSearch');
const navItems = document.querySelectorAll('.nav-item');

menuBtn.addEventListener('click', () => {
  drawer.setAttribute('aria-hidden', 'false');
});
drawerClose.addEventListener('click', () => {
  drawer.setAttribute('aria-hidden', 'true');
});

// Search modal
searchBtn.addEventListener('click', () => {
  searchModal.setAttribute('aria-hidden', 'false');
  document.getElementById('searchInput').focus();
});
closeSearch.addEventListener('click', () => {
  searchModal.setAttribute('aria-hidden', 'true');
});

// FAB action (مثال: افزودن آیتم)
document.getElementById('fab').addEventListener('click', () => {
  alert('عمل اصلی اجرا شد (این نمونه است).');
});

// Bottom nav: فقط استیت محلی و کلاس فعال
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.nav-item.active').classList.remove('active');
    btn.classList.add('active');
    // مسیرسازی ساده — در نسخهٔ واقعی از router یا صفحه‌های مجزا استفاده کن
    console.log('نقشه به:', btn.dataset.route);
  });
});
