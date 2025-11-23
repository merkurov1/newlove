const fs = require('fs');
const path = require('path');

// Куда сохраним результат
const OUTPUT_FILE = 'full_project_context.txt';

// Папки, которые нужно сканировать
const TARGET_DIRS = ['app', 'components', 'lib', 'hooks', 'types', 'utils'];

// Отдельные файлы в корне, которые важны
const ROOT_FILES = ['middleware.ts', 'middleware.js', 'next.config.js', 'next.config.mjs', 'tailwind.config.js', 'tsconfig.json', 'package.json', '.env.local'];

// Расширения, которые берем
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.sql', '.json'];

// Что игнорируем внутри папок
const IGNORE_PATTERNS = ['.next', 'node_modules', '.git', 'dist', 'build', 'yarn.lock', 'package-lock.json'];

let output = '';

// 1. Функция для чтения файла
function appendFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                const content = fs.readFileSync(filePath, 'utf8');
                output += `\n\n================================================================================\n`;
                output += `FILE PATH: ${filePath}\n`;
                output += `================================================================================\n`;
                output += content;
                console.log(`Added: ${filePath}`);
            }
        }
    } catch (e) {
        console.error(`Error reading ${filePath}: ${e.message}`);
    }
}

// 2. Рекурсивный обход папок
function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (IGNORE_PATTERNS.includes(file)) continue;

        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else {
            if (EXTENSIONS.includes(path.extname(file))) {
                appendFile(fullPath);
            }
        }
    }
}

// --- ЗАПУСК ---

console.log('Сборка проекта в один файл...');

// Собираем корневые файлы
ROOT_FILES.forEach(file => appendFile(file));

// Собираем папки
TARGET_DIRS.forEach(dir => walkDir(dir));

fs.writeFileSync(OUTPUT_FILE, output);
console.log(`\nГОТОВО! Весь код сохранен в файл: ${OUTPUT_FILE}`);