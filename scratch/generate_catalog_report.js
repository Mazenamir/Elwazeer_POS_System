const fs = require('fs');

const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>كتالوج النظام الشامل - منظومة الوزير</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #1e3a8a;
            --primary-light: #3b82f6;
            --secondary: #0f172a;
            --accent: #f59e0b;
            --accent-green: #10b981;
            --accent-purple: #8b5cf6;
            --accent-red: #ef4444;
            --bg: #f8fafc;
            --surface: #ffffff;
            --border: #e2e8f0;
            --text-main: #1e293b;
            --text-muted: #64748b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Cairo', sans-serif;
        }

        body {
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.7;
            padding: 30px 15px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header.hero {
            background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
            color: #ffffff;
            border-radius: 20px;
            padding: 45px 35px;
            margin-bottom: 35px;
            box-shadow: 0 10px 25px -5px rgba(30, 58, 138, 0.25);
            position: relative;
            overflow: hidden;
        }

        header.hero::after {
            content: '';
            position: absolute;
            left: -50px;
            bottom: -50px;
            width: 200px;
            height: 200px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 50%;
        }

        .hero h1 {
            font-size: 2.3rem;
            font-weight: 900;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .hero p {
            font-size: 1.15rem;
            color: #cbd5e1;
            max-width: 850px;
        }

        .meta-tags {
            display: flex;
            gap: 12px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        .tag {
            background: rgba(255, 255, 255, 0.12);
            padding: 6px 14px;
            border-radius: 30px;
            font-size: 0.85rem;
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .section-card {
            background: var(--surface);
            border-radius: 16px;
            border: 1px solid var(--border);
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04);
        }

        .section-title {
            font-size: 1.45rem;
            font-weight: 800;
            color: var(--secondary);
            margin-bottom: 22px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 12px;
        }

        .section-title span.icon {
            font-size: 1.6rem;
        }

        .grid-2 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 20px;
        }

        .grid-3 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
        }

        .module-box {
            background: #fdfdfd;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            transition: all 0.2s ease;
            position: relative;
        }

        .module-box:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
            border-color: var(--primary-light);
        }

        .module-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .module-name {
            font-weight: 700;
            font-size: 1.12rem;
            color: var(--primary);
        }

        .module-badge {
            font-size: 0.75rem;
            padding: 3px 8px;
            border-radius: 6px;
            font-weight: 600;
        }

        .badge-live {
            background: #ecfdf5;
            color: #065f46;
            border: 1px solid #a7f3d0;
        }

        .badge-proposed {
            background: #eff6ff;
            color: #1e40af;
            border: 1px solid #bfdbfe;
        }

        .module-desc {
            color: var(--text-muted);
            font-size: 0.92rem;
            margin-bottom: 12px;
        }

        .features-list {
            list-style: none;
            font-size: 0.9rem;
        }

        .features-list li {
            position: relative;
            padding-right: 20px;
            margin-bottom: 6px;
            color: #334155;
        }

        .features-list li::before {
            content: '✓';
            position: absolute;
            right: 0;
            color: var(--accent-green);
            font-weight: bold;
        }

        .features-list.future li::before {
            content: '✦';
            color: var(--accent);
        }

        table.styled-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            font-size: 0.95rem;
        }

        table.styled-table th {
            background-color: #f8fafc;
            color: #475569;
            text-align: right;
            padding: 12px 16px;
            border-bottom: 2px solid var(--border);
            font-weight: 700;
        }

        table.styled-table td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            vertical-align: middle;
        }

        table.styled-table tr:hover {
            background-color: #f1f5f9;
        }

        .badge-role {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 700;
        }

        .role-admin { background: #fee2e2; color: #991b1b; }
        .role-branch { background: #e0f2fe; color: #075985; }
        .role-cashier { background: #fef3c7; color: #92400e; }
        .role-store { background: #dcfce7; color: #166534; }
        .role-hr { background: #f3e8ff; color: #6b21a8; }
        .role-finance { background: #ffedd5; color: #9a3412; }

        .callout-box {
            background: #fffbeb;
            border-right: 4px solid var(--accent);
            padding: 18px 22px;
            border-radius: 8px;
            margin: 20px 0;
            color: #92400e;
        }

        .callout-box h4 {
            font-weight: 800;
            margin-bottom: 6px;
        }

        .future-card {
            background: #faf5ff;
            border: 1px solid #e9d5ff;
        }

        .future-card .module-name {
            color: #6b21a8;
        }

        footer {
            text-align: center;
            margin-top: 40px;
            color: var(--text-muted);
            font-size: 0.9rem;
            padding: 20px 0;
            border-top: 1px solid var(--border);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- HERO HEADER -->
        <header class="hero">
            <h1>🏢 كتالوج النظام الشامل - منظومة الوزير</h1>
            <p>توثيق تحليلي تفصيلي للإمكانيات الحالية، منظومة الصلاحيات والمستخدمين المسجلة، وهيكل الأدوار المقترح لتطوير النظام إلى أقصى كفاءة تشغيلية وتكاملية.</p>
            <div class="meta-tags">
                <div class="tag">📅 تاريخ التقرير: 10 أكتوبر 2026</div>
                <div class="tag">💻 بيئة العمل: Desktop SPA + Node.js + PostgreSQL + Offline Engine</div>
                <div class="tag">🏬 الفروع المسجلة: 10 فروع تشغيلية</div>
                <div class="tag">👥 الموظفين المسجلين: 28 موظفاً</div>
            </div>
        </header>

        <!-- 1. ACTUAL CURRENT USERS & PROFILES -->
        <section class="section-card">
            <div class="section-title">
                <span class="icon">👥</span>
                <h2>1. المستخدمون والبروفايلات المسجلة حالياً في النظام</h2>
            </div>
            <p style="margin-bottom: 15px; color: var(--text-muted);">
                يعتمد النظام حالياً برمجياً على 3 أدوار رئيسية (<code>admin</code>, <code>branch_user</code>, <code>cashier</code>)، مع تخصيص مصفوفة الصلاحيات (Permissions) لكل مستخدم بشكل فردي للتحكم في الشاشات التي يراها:
            </p>
            <div style="overflow-x: auto;">
                <table class="styled-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اسم المستخدم</th>
                            <th>الدور (Role)</th>
                            <th>الفرع المخصص</th>
                            <th>طبيعة الصلاحيات والشاشات المفتوحة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>1</td>
                            <td><strong>احمد</strong></td>
                            <td><span class="badge-role role-admin">admin</span></td>
                            <td>المخزن الرئيسي</td>
                            <td><strong>صلاحية كلية مطلقة:</strong> جميع الشاشات والإعدادات والنسخ الاحتياطي وحذف/تعديل البيانات وإدارة الفروع والمستخدمين.</td>
                        </tr>
                        <tr>
                            <td>2</td>
                            <td><strong>STORE</strong></td>
                            <td><span class="badge-role role-store">branch_user</span></td>
                            <td>المخزن الرئيسي</td>
                            <td>مخزن الإيجار، الباركود، المنتجات التالفة، الموردين، وإدارة المخزون ورؤية مخزون جميع الفروع (<code>inventory_admin</code> + <code>inventory_view_all_branches</code>).</td>
                        </tr>
                        <tr>
                            <td>3</td>
                            <td><strong>ANTALYA</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع ANTALYA</td>
                            <td>لوحة التحكم، مبيعات، إيجارات، باركود، عملاء، موردين، تعديلات، مصاريف، تقارير، موظفين، وإدارة المخزون (<code>inventory_admin</code>).</td>
                        </tr>
                        <tr>
                            <td>4</td>
                            <td><strong>الوزير</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع EL WAZER</td>
                            <td>لوحة تحكم، مبيعات، عملاء، موردين، تعديلات، منتجات تالفة، موظفين، مصروفات، تقارير.</td>
                        </tr>
                        <tr>
                            <td>5</td>
                            <td><strong>mazen</strong></td>
                            <td><span class="badge-role role-cashier">cashier</span></td>
                            <td>فرع EL WAZER</td>
                            <td><strong>كاشير صريح:</strong> شاشة البيع، الإيجارات، الباركود، العملاء، الموردين، مخزن الإيجار، التوالف.</td>
                        </tr>
                        <tr>
                            <td>6</td>
                            <td><strong>الرمل</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع ELRAML</td>
                            <td>لوحة تحكم، مبيعات، عملاء، موردين، تعديلات، توالف، موظفين، مصروفات، تقارير.</td>
                        </tr>
                        <tr>
                            <td>7</td>
                            <td><strong>بشر</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع BESHR</td>
                            <td>لوحة تحكم، مبيعات، إيجارات، عملاء، موردين، تعديلات، مخزن إيجار، توالف، موظفين، مصاريف، تقارير.</td>
                        </tr>
                        <tr>
                            <td>8</td>
                            <td><strong>راغب</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع MOHARM BEK</td>
                            <td>لوحة تحكم، مبيعات، إيجارات، عملاء، موردين، تعديلات، مخزن إيجار، توالف، مصاريف، تقارير، موظفين.</td>
                        </tr>
                        <tr>
                            <td>9</td>
                            <td><strong>العامريه</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع EL AMRYA</td>
                            <td>لوحة تحكم، مبيعات، إيجارات، عملاء، تعديلات، مصاريف، مخزن إيجار، توالف، موظفين، تقارير.</td>
                        </tr>
                        <tr>
                            <td>10</td>
                            <td><strong>البطاش</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع AL AGAMY</td>
                            <td>لوحة تحكم، مبيعات، إيجارات، عملاء، تعديلات، مخزن إيجار، توالف، موظفين، مصاريف، تقارير.</td>
                        </tr>
                        <tr>
                            <td>11</td>
                            <td><strong>دمنهور</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع DAMNHOR MAN</td>
                            <td>لوحة تحكم، مبيعات، باركود، عملاء، موردين، تعديلات، مصاريف، تقارير، موظفين، توالف.</td>
                        </tr>
                        <tr>
                            <td>12</td>
                            <td><strong>CASH1</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع DAMNHOR MAN</td>
                            <td>مبيعات سريعة، عملاء، تعديلات، موظفين، مصاريف، تقارير.</td>
                        </tr>
                        <tr>
                            <td>13</td>
                            <td><strong>FORHER</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع DAMNHOR WOMAN</td>
                            <td>لوحة تحكم، مبيعات، باركود، عملاء، موردين، تعديلات، مصاريف، تقارير، موظفين، مخزن إيجار، إدارة المخزون (<code>inventory_admin</code>).</td>
                        </tr>
                        <tr>
                            <td>14</td>
                            <td><strong>CASH2</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع DAMNHOR WOMAN</td>
                            <td>مبيعات، عملاء، تعديلات، موظفين، مصاريف، موردين، تقارير، باركود، توالف.</td>
                        </tr>
                        <tr>
                            <td>15</td>
                            <td><strong>كاش</strong></td>
                            <td><span class="badge-role role-branch">branch_user</span></td>
                            <td>فرع ANTALYA</td>
                            <td>مبيعات، إيجارات، باركود، عملاء، موردين، تعديلات، مخزن إيجار، توالف، موظفين، مصاريف.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <!-- 2. CURRENT SYSTEM CAPABILITIES CATALOG -->
        <section class="section-card">
            <div class="section-title">
                <span class="icon">⚡</span>
                <h2>2. كتالوج إمكانيات وشاشات النظام الحالية (Current Capabilities)</h2>
            </div>
            <div class="grid-3">
                <!-- Module: POS & Sales -->
                <div class="module-box">
                    <div class="module-header">
                        <span class="module-name">نقطة البيع (POS / المبيعات)</span>
                        <span class="module-badge badge-live">مفعل حالياً</span>
                    </div>
                    <p class="module-desc">إدارة عمليات البيع المباشر والكاش السريع وتوليد الفواتير الحرارية.</p>
                    <ul class="features-list">
                        <li>بيع فوري بالباركود أو البحث بالاسم والمقاس.</li>
                        <li>دعم طرق دفع متعددة (كاش، فيزا، آجل، محفظة).</li>
                        <li>طباعة إيصالات حرارية متوافقة مع جميع الطابعات.</li>
                        <li>خصومات ونسب مئوية مع حماية بكلمة سر لتعديل الفواتير.</li>
                        <li>إرجاع واستبدال الفواتير وخصمها من الخزينة.</li>
                    </ul>
                </div>

                <!-- Module: Rentals -->
                <div class="module-box">
                    <div class="module-header">
                        <span class="module-name">نظام التأجير والحجوزات (Rentals)</span>
                        <span class="module-badge badge-live">مفعل حالياً</span>
                    </div>
                    <p class="module-desc">منظومة متخصصة لتأجير البدل وفساتين السهرة والبدل الرسمية.</p>
                    <ul class="features-list">
                        <li>حجز القطعة بتاريخ المناسبة وتاريخ الاستلام والإرجاع.</li>
                        <li>تحصيل العربون وتأمين القطعة ومتابعة المتبقي.</li>
                        <li>منع التعارض في الحجوزات لنفس القطعة تلقائياً.</li>
                        <li>تتبع حالة البدل (محجوزة، تم الاستلام، متأخرة، تم الرد).</li>
                        <li>حساب غرامات التأخير وفحص حالة القطعة عند الاستلام.</li>
                    </ul>
                </div>

                <!-- Module: Alterations & Tailoring -->
                <div class="module-box">
                    <div class="module-header">
                        <span class="module-name">التعديلات والتفصيل (Alterations)</span>
                        <span class="module-badge badge-live">مفعل حالياً</span>
                    </div>
                    <p class="module-desc">إدارة بروفات المقاسات وتجهيز البدل للعملاء وطلبات التفصيل.</p>
                    <ul class="features-list">
                        <li>ربط التعديل مباشرة بفاتورة الإيجار أو البيع.</li>
                        <li>تسجيل مقاسات مفصلة (الكم، الوسط، الطول، الصدر، الياقة).</li>
                        <li>متابعة تاريخ البروفة الأولى وموعد التسليم النهائي للترزي.</li>
                        <li>قسم خاص بالتفصيل الجديد (Tailoring) للأقمشة والموديلات.</li>
                    </ul>
                </div>

                <!-- Module: HR & Attendance -->
                <div class="module-box">
                    <div class="module-header">
                        <span class="module-name">الموارد البشرية والورديات (HR)</span>
                        <span class="module-badge badge-live">مفعل حالياً</span>
                    </div>
                    <p class="module-desc">إدارة كاملة لبيانات الموظفين ومتابعة الدوام والرواتب.</p>
                    <ul class="features-list">
                        <li>سجل كامل لـ 28 موظف مسجلين وتوزيعهم على الفروع.</li>
                        <li>تسجيل الحضور والانصراف بالدقيقة وساعات العمل.</li>
                        <li>إشعارات وتنبيهات تلقائية بنهاية الشيفت (Shift Checkout Reminders).</li>
                        <li>الراتب الأساسي، السلف، المكافآت، الخصومات، والعمولات.</li>
                        <li>قفل الرواتب بكلمة سر خاصة لمنع التطفل.</li>
                    </ul>
                </div>

                <!-- Module: Multi-Branch & Warehouse -->
                <div class="module-box">
                    <div class="module-header">
                        <span class="module-name">المخازن وإدارة الفروع (Inventory)</span>
                        <span class="module-badge badge-live">مفعل حالياً</span>
                    </div>
                    <p class="module-desc">الربط بين المخزن الرئيسي ومخازن الفروع المستقلة.</p>
                    <ul class="features-list">
                        <li>فصل مخزون كل فرع مع إمكانية تحويل القطع بين الفروع.</li>
                        <li>مخزن خاص بالتأجير (Rental Inventory) ومخزن البيع المباشر.</li>
                        <li>طباعة باركود بتصاميم متعددة مع كود القطعة والمقاس.</li>
                        <li>قسم خاص بالهوالك والتوالف وإهلاك القطع القديمة (Worn Products).</li>
                        <li>تنبيهات انخفاض المخزون وإعادة الطلب.</li>
                    </ul>
                </div>

                <!-- Module: Reports & Financials -->
                <div class="module-box">
                    <div class="module-header">
                        <span class="module-name">التقارير والمصروفات (Reports & Expenses)</span>
                        <span class="module-badge badge-live">مفعل حالياً</span>
                    </div>
                    <p class="module-desc">التحليلات المالية والتدفقات النقدية والأرباح.</p>
                    <ul class="features-list">
                        <li>تسجيل المصروفات اليومية للفرع وتبويبها حسب النوع.</li>
                        <li>تقارير يومية وشهرية مجمعة أو مفصلة لكل فرع على حدة.</li>
                        <li>تقرير حركة الخزينة وتصفية الكاش عند تسليم الوردية.</li>
                        <li>تقارير الأرباح، حركة الإيجارات، وأداء مبيعات الموظفين.</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- 3. PROPOSED ROLES & PROFILES -->
        <section class="section-card">
            <div class="section-title">
                <span class="icon">🎯</span>
                <h2>3. هيكل الرولز (Roles) والبروفايلات المقترحة للوصول للتكامل التام</h2>
            </div>
            <p style="margin-bottom: 20px; color: var(--text-muted);">
                بدلاً من استخدام أدوار عامة يدخل تحتها خليط غير متجانس، يقترح تقسيم النظام إلى <strong>7 أدوار متخصصة</strong> تحقق الفصل التام للمهام والحماية المالية:
            </p>

            <div class="grid-2">
                <!-- Role 1 -->
                <div class="module-box" style="border-right: 4px solid #ef4444;">
                    <div class="module-header">
                        <span class="module-name">1. المدير العام / المالك (Super Admin)</span>
                        <span class="badge-role role-admin">إدارة عليا</span>
                    </div>
                    <p class="module-desc">صاحب النشاط أو الإدارة العليا للشركة.</p>
                    <ul class="features-list">
                        <li>الاطلاع على كامل الفروع، الخزائن، والأرباح الصافية المجمعة.</li>
                        <li>تعديل إعدادات السيستم العامة والنسخ الاحتياطي وكلمات سر الرواتب.</li>
                        <li>صلاحية حذف أو تعديل الفواتير والسجلات التاريخية المغلقة.</li>
                        <li>إضافة مستخدمين جدد وتحديد صلاحياتهم وتعيين مدراء الفروع.</li>
                    </ul>
                </div>

                <!-- Role 2 -->
                <div class="module-box" style="border-right: 4px solid #8b5cf6;">
                    <div class="module-header">
                        <span class="module-name">2. مدير الموارد البشرية (HR Manager)</span>
                        <span class="badge-role role-hr">موارد بشرية</span>
                    </div>
                    <p class="module-desc">المسؤول المباشر عن شؤون العاملين في كافة الفروع والورش.</p>
                    <ul class="features-list">
                        <li>تسجيل ملفات الموظفين وتعديل بياناتهم وتوزيعهم على الشيفتات.</li>
                        <li>متابعة سجلات الحضور والانصراف اللحظية والتأخيرات وتنبيهات الإغلاق.</li>
                        <li>تسجيل الخصومات، الجزاءات، المكافآت، الإجازات، وطلبات السلف.</li>
                        <li><strong>محظور عنه:</strong> الاطلاع على حركة المبيعات، الإيجارات، وفواتير الموردين.</li>
                    </ul>
                </div>

                <!-- Role 3 -->
                <div class="module-box" style="border-right: 4px solid #f97316;">
                    <div class="module-header">
                        <span class="module-name">3. المحاسب المالي ومدير الرواتب (Accountant & Payroll)</span>
                        <span class="badge-role role-finance">مالية وحسابات</span>
                    </div>
                    <p class="module-desc">مسؤول القيود والمصروفات وكشوف المرتبات الشهرية وحسابات الموردين.</p>
                    <ul class="features-list">
                        <li>إقفال شيت المرتبات الشهري وحساب العمولات وإصدار أذونات الصرف.</li>
                        <li>مراجعة حركات الخزينة اليومية ومطابقة إيرادات الفروع بالمصروفات.</li>
                        <li>إدارة حسابات الموردين والأقساط والدفعات الآجلة.</li>
                        <li>تقارير الأرباح التشغيلية، الضرائب، والمصروفات الرأسمالية.</li>
                    </ul>
                </div>

                <!-- Role 4 -->
                <div class="module-box" style="border-right: 4px solid #10b981;">
                    <div class="module-header">
                        <span class="module-name">4. أمين المخزن الرئيسي (Central Storekeeper)</span>
                        <span class="badge-role role-store">سلاسل الإمداد</span>
                    </div>
                    <p class="module-desc">المتحكم الوحيد في البضاعة المركزية والأصناف والباركود وتوزيعها.</p>
                    <ul class="features-list">
                        <li>إضافة المنتجات والبدل وتوليد وطباعة الباركود والأسعار.</li>
                        <li>استلام شحنات الموردين وتكوين دفعات التوريد.</li>
                        <li>إصدار أذونات التحويل من المخزن المركزي إلى الفروع ومتابعة وصولها.</li>
                        <li>إدارة بضاعة التوالف والهوالك ونقلها لمستودع التكهين.</li>
                    </ul>
                </div>

                <!-- Role 5 -->
                <div class="module-box" style="border-right: 4px solid #0284c7;">
                    <div class="module-header">
                        <span class="module-name">5. مدير الفرع (Branch Manager)</span>
                        <span class="badge-role role-branch">تشغيل الفروع</span>
                    </div>
                    <p class="module-desc">المسؤول الأول عن انضباط الفرع ومبيعاته وموظفيه.</p>
                    <ul class="features-list">
                        <li>لوحة تحكم وتقارير خاصة بمبيعات وإيجارات فرعه فقط.</li>
                        <li>تسجيل واعتماد المصروفات النثرية اليومية للفرع.</li>
                        <li>تسجيل حضور وانصراف موظفي الفرع في بداية ونهاية الشيفت.</li>
                        <li>إلغاء فواتير البيع الخاطئة لنفس اليوم بكلمة سره.</li>
                    </ul>
                </div>

                <!-- Role 6 -->
                <div class="module-box" style="border-right: 4px solid #eab308;">
                    <div class="module-header">
                        <span class="module-name">6. كاشير وموظف استقبال (Cashier / Front-Desk)</span>
                        <span class="badge-role role-cashier">نقطة البيع</span>
                    </div>
                    <p class="module-desc">موظف واجهة الفرع المختص بالتعامل مع العملاء.</p>
                    <ul class="features-list">
                        <li>تسجيل فواتير البيع وحجوزات الإيجار واستلام التأمينات.</li>
                        <li>استلام البدل المرتجعة وفحص سلامتها ورد مبالغ التأمين.</li>
                        <li>طباعة الفاتورة للعميل وتحصيل الدفعات بالباركود.</li>
                        <li><strong>محظور عنه:</strong> تعديل الأسعار، إلغاء فاتورة بعد حفظها، أو رؤية رواتب وأرباح.</li>
                    </ul>
                </div>

                <!-- Role 7 -->
                <div class="module-box" style="border-right: 4px solid #6366f1;">
                    <div class="module-header">
                        <span class="module-name">7. فني التعديلات والتفصيل (Tailor / Workshop)</span>
                        <span class="badge-role role-branch">الورشة الفنية</span>
                    </div>
                    <p class="module-desc">المسؤول عن التجهيز وتضييق وتقصير البدل وتنفيذ المقاسات.</p>
                    <ul class="features-list">
                        <li>شاشة التعديلات (Alterations): ميعاد البروفة وموعد تسليم البدلة وتفاصيل المقاس.</li>
                        <li>تغيير حالة البدلة: (قيد التجهيز ➔ جاهزة للتسليم ➔ تم الاستلام).</li>
                        <li><strong>محظور عنه:</strong> الأسعار، الحسابات، الخزينة، والمبالغ المالية تماماً.</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- 4. FUTURE CAPABILITIES & ROADMAP -->
        <section class="section-card">
            <div class="section-title">
                <span class="icon">🚀</span>
                <h2>4. إمكانيات مقترحة للتطوير المستقبلي (Future Upgrades)</h2>
            </div>
            <p style="margin-bottom: 20px; color: var(--text-muted);">
                ترقيات تكنولوجية وتنظيمية تجعل منظومة الوزير تعمل بأعلى كفاءة ذكية وتنافس كبرى المنصات العالمية:
            </p>

            <div class="grid-3">
                <!-- Future 1 -->
                <div class="module-box future-card">
                    <div class="module-header">
                        <span class="module-name">تطبيق موبايل / واتساب للعملاء</span>
                        <span class="module-badge badge-proposed">مقترح مستقبلي</span>
                    </div>
                    <p class="module-desc">ربط النظام بإشعارات WhatsApp التلقائية API.</p>
                    <ul class="features-list future">
                        <li>إرسال رسالة ترحيبية وإيصال الحجز الإلكتروني عبر الواتساب فوراً.</li>
                        <li>تذكير العميل بموعد البروفة وموعد استلام البدلة قبلها بـ 24 ساعة.</li>
                        <li>تذكير بموعد إرجاع البدلة لتجنب غرامات التأخير.</li>
                    </ul>
                </div>

                <!-- Future 2 -->
                <div class="module-box future-card">
                    <div class="module-header">
                        <span class="module-name">إدارة دورة غسيل ومغاسل البدل</span>
                        <span class="module-badge badge-proposed">مقترح مستقبلي</span>
                    </div>
                    <p class="module-desc">دورة حياة متكاملة للبدلة بعد إرجاعها من الزبون (Dry Clean Cycle).</p>
                    <ul class="features-list future">
                        <li>نقل البدلة فور إرجاعها إلى مرحلة "تحت الغسيل والكي".</li>
                        <li>تتبع البدل المرسلة للمغاسل الخارجية وتكلفتها وحساب المغسلة.</li>
                        <li>منع إتاحة البدلة للتأجير مجدداً إلا بعد إقرار استلامها جاهزة من المغسلة.</li>
                    </ul>
                </div>

                <!-- Future 3 -->
                <div class="module-box future-card">
                    <div class="module-header">
                        <span class="module-name">جهاز البصمة وHR الذكي</span>
                        <span class="module-badge badge-proposed">مقترح مستقبلي</span>
                    </div>
                    <p class="module-desc">ربط أجهزة البصمة البيومترية مباشرة بقاعدة بيانات السيستم.</p>
                    <ul class="features-list future">
                        <li>سحب البصمة تلقائياً (ZKTeco / Hikvision) دون تدخل يدوي.</li>
                        <li>احتساب التأخير بالدقائق والخصم الآلي وفق لائحة العمل.</li>
                        <li>تطبيق موبايل للموظفين لطلب السلفة أو الإجازة إلكترونياً.</li>
                    </ul>
                </div>

                <!-- Future 4 -->
                <div class="module-box future-card">
                    <div class="module-header">
                        <span class="module-name">سيرفر كلاود ومزامنة هجينة متطورة</span>
                        <span class="module-badge badge-proposed">مقترح مستقبلي</span>
                    </div>
                    <p class="module-desc">ربط الفروع بسيرفر سحابي مركزي مع استمرار العمل في حالة انقطاع النت.</p>
                    <ul class="features-list future">
                        <li>مزامنة فورية (Real-time WebSockets) لكل حركة بيع أو حجز.</li>
                        <li>رؤية حية لصاحب العمل على هاتفه للأداء اللحظي لكل فرع من أي مكان.</li>
                        <li>حماية البيانات من الضياع بنسخ احتياطي سحابي تلقائي كل ساعة.</li>
                    </ul>
                </div>

                <!-- Future 5 -->
                <div class="module-box future-card">
                    <div class="module-header">
                        <span class="module-name">نقاط الولاء والعروض الترويجية</span>
                        <span class="module-badge badge-proposed">مقترح مستقبلي</span>
                    </div>
                    <p class="module-desc">منظومة تسويقية للحفاظ على العملاء وزيادة المبيعات.</p>
                    <ul class="features-list future">
                        <li>تجميع نقاط للعميل مع كل عملية شراء أو تأجير.</li>
                        <li>كوبونات خصم ترويجية موسمية محددة بفترة صلاحية.</li>
                        <li>تقارير أفضل العملاء وأكثرهم تردداً على الفروع (VIP Customers).</li>
                    </ul>
                </div>

                <!-- Future 6 -->
                <div class="module-box future-card">
                    <div class="module-header">
                        <span class="module-name">سجل التدقيق والتتبع الشامل (Audit Log)</span>
                        <span class="module-badge badge-proposed">مقترح مستقبلي</span>
                    </div>
                    <p class="module-desc">صندوق أسود يسجل كل نقرة زر وأي تعديل أو محاولة اختراق.</p>
                    <ul class="features-list future">
                        <li>تسجيل من قام بطباعة، حذف، تعديل، أو استرجاع أي فاتورة.</li>
                        <li>تسجيل وقت وتاريخ الجهاز وعنوان الآي بي لكل عملية حساسة.</li>
                        <li>إشعار فوري للمدير على الهاتف في حال حدوث خصم يدوي غير معتاد.</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- 5. IMPLEMENTATION ROADMAP -->
        <section class="section-card">
            <div class="section-title">
                <span class="icon">🗺️</span>
                <h2>5. خطة التنفيذ المقترحة خطوة بخطوة</h2>
            </div>
            <div class="callout-box">
                <h4>💡 توصية تنفيذية سريعة:</h4>
                <p>يمكن تطبيق الأدوار الجديدة برمجياً دون أي تعطيل لحركة العمل الحالية، وذلك عبر ترقية مصفوفة الصلاحيات في ملف <code>permissions.js</code> وربط شاشة إدارة المستخدمين بقائمة منسدلة للأدوار المقترحة، مع تعيين مستخدمي الفروع الحالية مباشرة على الأدوار المطابقة لطبيعة عملهم.</p>
            </div>
            <div style="overflow-x: auto;">
                <table class="styled-table">
                    <thead>
                        <tr>
                            <th>المرحلة</th>
                            <th>الأهداف</th>
                            <th>المخرجات المتوقعة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>المرحلة 1: الفصل الإداري الفوري</strong></td>
                            <td>إنشاء رول الـ HR المستقل ورول الكاشير المحدود.</td>
                            <td>حماية رواتب الموظفين ومنع الكاشير من رؤية الأرباح وتقارير الفروع.</td>
                        </tr>
                        <tr>
                            <td><strong>المرحلة 2: اختصاصات الفروع والورش</strong></td>
                            <td>عزل شاشة التعديلات (الترزي) عن المعاملات المالية والمخزن.</td>
                            <td>تسليم شاشات مخصصة لغرف القياس والورش بدون أسعار أو إيرادات.</td>
                        </tr>
                        <tr>
                            <td><strong>المرحلة 3: سلاسل الإمداد ومسؤول المخازن</strong></td>
                            <td>توحيد كود الصنف والباركود عبر حساب أمين المخزن المركزي فقط.</td>
                            <td>منع التكرار في الأصناف وضبط حركة الصادر والوارد بين المخزن والفروع.</td>
                        </tr>
                        <tr>
                            <td><strong>المرحلة 4: التقنيات الذكية (مستقبلاً)</strong></td>
                            <td>الربط مع أجهزة البصمة، إشعارات الواتساب، والنسخ السحابي.</td>
                            <td>نظام ذكي متكامل يعمل بأعلى موثوقية وتوسع مستقبلي.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <footer>
            تم إعداد واستخراج هذا التقرير الفني المرجعي بالكامل بناءً على فحص البنية التحتية البرمجية وقاعدة بيانات منظومة الوزير الحالية.<br>
            حقوق التطوير &copy; 2026 - منظومة الوزير
        </footer>
    </div>
</body>
</html>
`;

const targetPath = 'C:/Users/mazen/Downloads/ElWazeer_System_Catalog_and_Roles_Report.html';
fs.writeFileSync(targetPath, htmlContent, 'utf8');
console.log('SUCCESS_CREATED_AT: ' + targetPath);
