const fs = require('fs');

const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>دليل ربط ومزامنة الأجهزة والـ Virtual Machines - منظومة الوزير</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #1e3a8a;
            --primary-light: #2563eb;
            --secondary: #0f172a;
            --accent: #f59e0b;
            --danger: #ef4444;
            --success: #10b981;
            --purple: #8b5cf6;
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
            line-height: 1.8;
            padding: 30px 15px;
        }

        .container {
            max-width: 1100px;
            margin: 0 auto;
        }

        header.hero {
            background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
            color: #ffffff;
            border-radius: 20px;
            padding: 40px 35px;
            margin-bottom: 30px;
            box-shadow: 0 10px 25px -5px rgba(30, 58, 138, 0.25);
            position: relative;
        }

        .hero h1 {
            font-size: 2.1rem;
            font-weight: 900;
            margin-bottom: 12px;
        }

        .hero p {
            font-size: 1.1rem;
            color: #cbd5e1;
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
            font-size: 1.4rem;
            font-weight: 800;
            color: var(--secondary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 12px;
        }

        .diagram-container {
            background: #f1f5f9;
            border: 2px dashed #cbd5e1;
            border-radius: 14px;
            padding: 25px;
            margin: 20px 0;
            display: flex;
            justify-content: space-around;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
        }

        .pc-box {
            background: #ffffff;
            border: 2px solid #cbd5e1;
            border-radius: 12px;
            padding: 20px;
            width: 300px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        .pc-box.main {
            border-color: var(--primary-light);
            background: #eff6ff;
        }

        .pc-box.vm {
            border-color: var(--purple);
            background: #faf5ff;
        }

        .pc-icon {
            font-size: 2.5rem;
            margin-bottom: 8px;
        }

        .pc-title {
            font-weight: 800;
            font-size: 1.1rem;
            margin-bottom: 6px;
        }

        .barrier-sign {
            background: #fee2e2;
            color: var(--danger);
            border: 2px solid #fca5a5;
            padding: 12px 18px;
            border-radius: 30px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .solution-card {
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 25px;
            margin-bottom: 20px;
            background: #fcfcfc;
            border-right: 5px solid var(--primary-light);
        }

        .solution-card.alt {
            border-right-color: var(--purple);
        }

        .solution-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .solution-title {
            font-size: 1.25rem;
            font-weight: 800;
            color: var(--secondary);
        }

        .badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 700;
        }

        .badge-recommended {
            background: #dcfce7;
            color: #15803d;
        }

        .badge-advanced {
            background: #f3e8ff;
            color: #7e22ce;
        }

        .step-list {
            list-style: none;
            counter-reset: step-counter;
            margin-top: 15px;
        }

        .step-list li {
            position: relative;
            padding-right: 40px;
            margin-bottom: 16px;
        }

        .step-list li::before {
            counter-increment: step-counter;
            content: counter(step-counter);
            position: absolute;
            right: 0;
            top: 0;
            width: 28px;
            height: 28px;
            background: var(--primary-light);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85rem;
            font-weight: 700;
        }

        .code-snippet {
            background: #1e293b;
            color: #f8fafc;
            direction: ltr;
            text-align: left;
            padding: 14px 18px;
            border-radius: 8px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.9rem;
            margin: 10px 0;
            overflow-x: auto;
        }

        .highlight-var {
            color: #38bdf8;
        }

        .highlight-val {
            color: #facc15;
        }

        .callout {
            background: #fffbeb;
            border-right: 4px solid var(--accent);
            padding: 16px 20px;
            border-radius: 8px;
            margin: 15px 0;
            color: #92400e;
            font-size: 0.95rem;
        }

        table.summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }

        table.summary-table th {
            background: #f8fafc;
            padding: 12px;
            text-align: right;
            border-bottom: 2px solid var(--border);
            font-weight: 700;
        }

        table.summary-table td {
            padding: 12px;
            border-bottom: 1px solid var(--border);
        }

        footer {
            text-align: center;
            margin-top: 40px;
            color: var(--text-muted);
            font-size: 0.9rem;
            padding-top: 20px;
            border-top: 1px solid var(--border);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- HEADER -->
        <header class="hero">
            <h1>🔌 دليل ربط ومزامنة الأجهزة والـ Virtual Machines</h1>
            <p>شرح عملي ومبسط لسبب عدم حدوث المزامنة تلقائياً عند تسطيب البرنامج على جهاز افتراضي (VM)، وكيفية ضبط الاتصال خطوة بخطوة لتعمل الأجهزة معاً على نفس البيانات.</p>
        </header>

        <!-- 1. WHY DEFAULT DOES NOT SYNC -->
        <section class="section-card">
            <div class="section-title">
                <span>❓</span>
                <h2>1. لماذا لا يحدث Sync تلقائياً بين جهازك والـ VM بمجرد التسطيب؟</h2>
            </div>
            
            <p>
                البرنامج الحالي مبني بنظام يُسمى <strong>(Standalone Self-Contained App)</strong>، أي أنه تطبيق متكامل بذاته؛ فملف الـ <code>Setup.exe</code> يحتوي بداخله على قاعدة بيانات خاصة به.
            </p>

            <div class="diagram-container">
                <div class="pc-box main">
                    <div class="pc-icon">💻</div>
                    <div class="pc-title">جهازك الأساسي (Host PC)</div>
                    <p style="font-size: 0.85rem; color: #475569;">
                        البرنامج شغال على منفذ:<br>
                        <strong>127.0.0.1:5432</strong><br>
                        (قاعدة بيانات داخلية تخص جهازك فقط)
                    </p>
                </div>

                <div class="barrier-sign">
                    <span>⛔ لا يوجد اتصال تلقائي</span>
                </div>

                <div class="pc-box vm">
                    <div class="pc-icon">🖥️</div>
                    <div class="pc-title">الـ Virtual Machine (VM)</div>
                    <p style="font-size: 0.85rem; color: #475569;">
                        عند تسطيب الـ EXE عليها، صنعت:<br>
                        <strong>127.0.0.1:5432 مستقلة</strong><br>
                        (قاعدة بيانات جديدة ومعزولة تماماً)
                    </p>
                </div>
            </div>

            <div class="callout">
                <strong>النتيجة العملية:</strong> كل جهاز يعمل في "جزيرة منعزلة" خاصة به. إذا قمت بعمل فاتورة على جهازك لن تراها الـ VM، وإذا سجلت عميلاً على الـ VM لن يظهر على جهازك، لأن كل منهما يخزن الداتا داخل نفسه.
            </div>
        </section>

        <!-- 2. HOW TO SOLVE IT -->
        <section class="section-card">
            <div class="section-title">
                <span>🛠️</span>
                <h2>2. كيف تجعل الـ VM وجهازك يقرآن نفس البيانات؟ (طريقتان عمليتان)</h2>
            </div>

            <!-- SOLUTION 1: RECOMMENDED -->
            <div class="solution-card">
                <div class="solution-header">
                    <span class="solution-title">الطريقة الأولى: قاعدة بيانات موحدة على الشبكة (مباشرة وفورية - المستحسنة)</span>
                    <span class="badge badge-recommended">الأسهل والأسرع 100%</span>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 15px;">
                    في هذه الطريقة، الـ VM لن تستخدم قاعدة بياناتها المنفصلة، بل ستتصل مباشرة بقاعدة بيانات جهازك الأساسي. أي نقرة أو فاتورة على أي من الجهازين تظهر فوراً في الجزء من الثانية على الآخر!
                </p>

                <ol class="step-list">
                    <li>
                        <strong>ضبط كارت شبكة الـ Virtual Machine:</strong><br>
                        في برنامج الـ VM (مثل VirtualBox أو VMware)، ادخل على إعدادات الشبكة (Network Settings) وغير النوع من <code>NAT</code> إلى <strong>Bridged Adapter</strong>.<br>
                        <small style="color: #64748b;">(هذا يجعل الـ VM تأخذ عنوان IP خاص بها وكأنها جهاز كمبيوتر حقيقي متصل بنفس الراوتر).</small>
                    </li>
                    <li>
                        <strong>معرفة عنوان IP لجهازك الأساسي:</strong><br>
                        افتح موجه الأوامر (CMD) على جهازك الأساسي واكتب <code>ipconfig</code>، ستجد عنوان مثل: <code>192.168.1.50</code>.
                    </li>
                    <li>
                        <strong>تعديل ملف الإعدادات داخل الـ Virtual Machine:</strong><br>
                        على الـ VM، اذهب إلى مسار البرنامج وافتح ملف <code>.env</code>، وغير السطر الخاص بالـ <code>DB_HOST</code>:
                        <div class="code-snippet">
<span class="highlight-var">DB_HOST</span> = <span class="highlight-val">192.168.1.50</span>   <span style="color:#64748b;"># اكتب IP جهازك الأساسي هنا بدلاً من 127.0.0.1</span>
<span class="highlight-var">DB_PORT</span> = <span class="highlight-val">5432</span>
<span class="highlight-var">DB_USER</span> = <span class="highlight-val">postgres</span>
<span class="highlight-var">DB_PASSWORD</span> = <span class="highlight-val">ahmed1@</span>
<span class="highlight-var">DB_NAME</span> = <span class="highlight-val">pos_db</span>
                        </div>
                    </li>
                    <li>
                        <strong>شغل البرنامج على الـ VM:</strong><br>
                        ستجد كل المنتجات، الفواتير، الموظفين، والعملاء الموجودين على جهازك الأساسي ظهروا فوراً داخل الـ VM!
                    </li>
                </ol>
            </div>

            <!-- SOLUTION 2: SYNC ENGINE -->
            <div class="solution-card alt">
                <div class="solution-header">
                    <span class="solution-title">الطريقة الثانية: نظام المزامنة الذكي المدمج (Sync Engine - وضع الفروع المستقلة)</span>
                    <span class="badge badge-advanced">مخصصة للفروع البعيدة (Offline-First)</span>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 15px;">
                    هذه الطريقة ممتازة إذا كانت الـ VM تمثل "فرعاً مستقلاً" (مثل فرع دمنهور أو بشر)، وتريد أن تعمل الـ VM حتى لو فصل الإنترنت، ثم تقوم برفع الفواتير لجهازك تلقائياً عند توفر الاتصال.
                </p>

                <ol class="step-list">
                    <li>
                        <strong>تأكيد جهازك كـ سيرفر رئيسي (Sync Target):</strong><br>
                        في ملف <code>.env</code> على جهازك الأساسي، السيرفر مضبوط بالفعل على:
                        <div class="code-snippet">
<span class="highlight-var">SYNC_TARGET</span> = <span class="highlight-val">true</span>
<span class="highlight-var">SYNC_API_KEY</span> = <span class="highlight-val">BebyoonSecretKey2026</span>
<span class="highlight-var">PORT</span> = <span class="highlight-val">6253</span>
                        </div>
                    </li>
                    <li>
                        <strong>تفعيل وضع الفرع على الـ Virtual Machine:</strong><br>
                        داخل الـ VM، افتح ملف <code>.env</code> وضع الإعدادات التالية:
                        <div class="code-snippet">
<span class="highlight-var">APP_MODE</span> = <span class="highlight-val">branch</span>
<span class="highlight-var">BRANCH_ID</span> = <span class="highlight-val">2</span>
<span class="highlight-var">SYNC_SERVER_URL</span> = <span class="highlight-val">http://192.168.1.50:6253</span>  <span style="color:#64748b;"># رابط سيرفر جهازك الأساسي</span>
<span class="highlight-var">SYNC_API_KEY</span> = <span class="highlight-val">BebyoonSecretKey2026</span>
                        </div>
                    </li>
                    <li>
                        <strong>آلية العمل:</strong><br>
                        الـ VM تبيع وتخزن محلياً في <code>branch.sqlite</code> سريع جداً، وفي الخلفية يرسل الموديول (Sync Runner) العمليات المسجلة إلى جهازك الأساسي عبر الـ API.
                    </li>
                </ol>
            </div>
        </section>

        <!-- 3. COMPARISON TABLE -->
        <section class="section-card">
            <div class="section-title">
                <span>⚖️</span>
                <h2>3. مقارنة سريعة للاختيار بين الطريقتين</h2>
            </div>

            <table class="summary-table">
                <thead>
                    <tr>
                        <th>وجه المقارنة</th>
                        <th>الطريقة الأولى (قاعدة بيانات موحدة DB_HOST)</th>
                        <th>الطريقة الثانية (نظام المزامنة Sync Engine)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>السرعة والتزامن</strong></td>
                        <td>لحظي وفوري في نفس الثانية (Real-time).</td>
                        <td>مزامنة دورية عبر طابور عمليات (Queue).</td>
                    </tr>
                    <tr>
                        <td><strong>العمل في حال انقطاع الشبكة</strong></td>
                        <td>يتوقف الجهاز الثاني حتى عودة اتصال الشبكة.</td>
                        <td>يستمر الفرع في البيع بدون نت، وعند عودة النت يرفع الداتا.</td>
                    </tr>
                    <tr>
                        <td><strong>أفضل استخدام لها</strong></td>
                        <td><strong>أجهزة داخل نفس المحل أو فيرجوال ماشين للتجربة.</strong></td>
                        <td><strong>فروع في مدن ومحافظات مختلفة عبر الإنترنت.</strong></td>
                    </tr>
                    <tr>
                        <td><strong>سهولة الضبط</strong></td>
                        <td>سطر واحد في ملف الـ <code>.env</code> فقط.</td>
                        <td>ضبط الـ API Key وربط الفرع بالسيرفر.</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <footer>
            تم إعداد هذا التقرير التوضيحي لحل التزامن بين الأجهزة والبيئات الافتراضية.<br>
            منظومة الوزير &copy; 2026
        </footer>
    </div>
</body>
</html>
`;

const targetPath = 'C:/Users/mazen/Downloads/VM_and_PC_Sync_Guide.html';
fs.writeFileSync(targetPath, htmlContent, 'utf8');
console.log('CREATED_SUCCESSFULLY: ' + targetPath);
