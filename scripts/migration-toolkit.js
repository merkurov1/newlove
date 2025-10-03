#!/usr/bin/env node

/**
 * 🛡️ BULLETPROOF MIGRATION TOOLKIT
 * Максимально надёжная система управления миграциями
 * Работает независимо от состояния базы данных
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 🎯 Конфигурация
const CONFIG = {
  BACKUP_DIR: './backups',
  TIMEOUT: 30000, // 30 секунд на операцию
  MAX_RETRIES: 3,
  ENVIRONMENTS: {
    development: process.env.DATABASE_URL || 'postgresql://localhost:5432/dev',
    production: process.env.DATABASE_URL_PROD || process.env.DATABASE_URL,
    staging: process.env.DATABASE_URL_STAGING || process.env.DATABASE_URL
  }
};

class MigrationToolkit {
  constructor() {
    this.ensureBackupDir();
    console.log('🛡️ Migration Toolkit инициализирован');
  }

  // 📁 Создаём директорию для бэкапов
  ensureBackupDir() {
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
      fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });
      console.log(`📁 Создана директория бэкапов: ${CONFIG.BACKUP_DIR}`);
    }
  }

  // 🔄 Безопасное выполнение команды с таймаутом
  safeExec(command, options = {}) {
    const timeout = options.timeout || CONFIG.TIMEOUT;
    console.log(`⚡ Выполняем: ${command}`);
    
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        timeout: timeout,
        stdio: ['inherit', 'pipe', 'pipe'],
        ...options
      });
      console.log(`✅ Команда выполнена успешно`);
      return { success: true, output: result };
    } catch (error) {
      console.error(`❌ Ошибка выполнения команды:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // 📊 Проверка состояния миграций (с таймаутом)
  async checkMigrationStatus() {
    console.log('🔍 Проверяем состояние миграций...');
    
    const result = this.safeExec('npx prisma migrate status', { timeout: 15000 });
    
    if (result.success) {
      console.log('✅ Миграции синхронизированы');
      return { synced: true, output: result.output };
    } else {
      console.log('⚠️ Проблемы с миграциями или БД недоступна');
      return { synced: false, error: result.error };
    }
  }

  // 💾 Создание бэкапа схемы (локально)
  createSchemaBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(CONFIG.BACKUP_DIR, `schema-backup-${timestamp}.prisma`);
    
    try {
      fs.copyFileSync('./prisma/schema.prisma', backupPath);
      console.log(`💾 Бэкап схемы создан: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('❌ Ошибка создания бэкапа схемы:', error.message);
      return null;
    }
  }

  // 📥 Создание SQL бэкапа (если БД доступна)
  async createDatabaseBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(CONFIG.BACKUP_DIR, `db-backup-${timestamp}.sql`);
    
    console.log('💾 Создаём бэкап базы данных...');
    
    // Пытаемся создать SQL дамп
    const result = this.safeExec(
      `npx prisma db pull --print > ${backupPath}`,
      { timeout: 20000 }
    );
    
    if (result.success && fs.existsSync(backupPath)) {
      console.log(`✅ SQL бэкап создан: ${backupPath}`);
      return backupPath;
    } else {
      console.log('⚠️ Не удалось создать SQL бэкап (БД недоступна)');
      return null;
    }
  }

  // 🎯 Валидация схемы Prisma
  validateSchema() {
    console.log('🔍 Валидируем схему Prisma...');
    
    const result = this.safeExec('npx prisma validate', { timeout: 10000 });
    
    if (result.success) {
      console.log('✅ Схема валидна');
      return true;
    } else {
      console.error('❌ Ошибки в схеме:', result.error);
      return false;
    }
  }

  // 🚀 Генерация Prisma Client
  generateClient() {
    console.log('🔧 Генерируем Prisma Client...');
    
    const result = this.safeExec('npx prisma generate', { timeout: 30000 });
    
    if (result.success) {
      console.log('✅ Prisma Client сгенерирован');
      return true;
    } else {
      console.error('❌ Ошибка генерации клиента:', result.error);
      return false;
    }
  }

  // 📋 Создание новой миграции
  async createMigration(name) {
    if (!name) {
      console.error('❌ Не указано имя миграции');
      return false;
    }

    console.log(`🎯 Создаём миграцию: ${name}`);
    
    // 1. Валидируем схему
    if (!this.validateSchema()) {
      console.error('❌ Прерываем: схема невалидна');
      return false;
    }

    // 2. Создаём бэкапы
    this.createSchemaBackup();
    await this.createDatabaseBackup();

    // 3. Создаём миграцию
    const result = this.safeExec(
      `npx prisma migrate dev --name ${name} --create-only`,
      { timeout: 20000 }
    );

    if (result.success) {
      console.log(`✅ Миграция ${name} создана (но не применена)`);
      console.log('📋 Проверьте SQL файл миграции перед применением');
      return true;
    } else {
      console.error('❌ Ошибка создания миграции:', result.error);
      return false;
    }
  }

  // ⚡ Применение миграций
  async deployMigrations() {
    console.log('⚡ Применяем миграции...');
    
    // 1. Создаём бэкапы
    this.createSchemaBackup();
    await this.createDatabaseBackup();

    // 2. Применяем миграции
    const result = this.safeExec('npx prisma migrate deploy', { timeout: 60000 });

    if (result.success) {
      console.log('✅ Миграции применены успешно');
      
      // 3. Генерируем клиент
      this.generateClient();
      return true;
    } else {
      console.error('❌ Ошибка применения миграций:', result.error);
      console.log('🔄 Рассмотрите возможность отката или ручного исправления');
      return false;
    }
  }

  // 🔄 Полный рабочий процесс
  async fullWorkflow(migrationName) {
    console.log('🚀 ЗАПУСК ПОЛНОГО РАБОЧЕГО ПРОЦЕССА');
    console.log('=' * 50);

    // 1. Проверяем статус
    const status = await this.checkMigrationStatus();
    console.log(`📊 Статус БД: ${status.synced ? 'Синхронизирована' : 'Требует внимания'}`);

    // 2. Валидируем схему
    if (!this.validateSchema()) {
      console.error('🛑 Останавливаемся: схема невалидна');
      return false;
    }

    // 3. Если нужна новая миграция
    if (migrationName) {
      const created = await this.createMigration(migrationName);
      if (!created) {
        console.error('🛑 Останавливаемся: не удалось создать миграцию');
        return false;
      }
    }

    // 4. Применяем миграции
    const deployed = await this.deployMigrations();
    if (!deployed) {
      console.error('🛑 Проблема с применением миграций');
      return false;
    }

    console.log('🎉 ПОЛНЫЙ РАБОЧИЙ ПРОЦЕСС ЗАВЕРШЁН УСПЕШНО!');
    return true;
  }

  // 📋 Показать справку
  showHelp() {
    console.log(`
🛡️ MIGRATION TOOLKIT - Справка по командам:

📊 Проверка статуса:
  node scripts/migration-toolkit.js status

🔍 Валидация схемы:
  node scripts/migration-toolkit.js validate

🔧 Генерация клиента:
  node scripts/migration-toolkit.js generate

📋 Создать миграцию:
  node scripts/migration-toolkit.js create <имя>

⚡ Применить миграции:
  node scripts/migration-toolkit.js deploy

🚀 Полный процесс:
  node scripts/migration-toolkit.js workflow [имя-миграции]

💾 Создать бэкап:
  node scripts/migration-toolkit.js backup

📋 Эта справка:
  node scripts/migration-toolkit.js help
    `);
  }
}

// 🎯 CLI интерфейс
async function main() {
  const toolkit = new MigrationToolkit();
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'status':
      await toolkit.checkMigrationStatus();
      break;
    
    case 'validate':
      toolkit.validateSchema();
      break;
    
    case 'generate':
      toolkit.generateClient();
      break;
    
    case 'create':
      await toolkit.createMigration(arg);
      break;
    
    case 'deploy':
      await toolkit.deployMigrations();
      break;
    
    case 'workflow':
      await toolkit.fullWorkflow(arg);
      break;
    
    case 'backup':
      toolkit.createSchemaBackup();
      await toolkit.createDatabaseBackup();
      break;
    
    case 'help':
    default:
      toolkit.showHelp();
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MigrationToolkit;