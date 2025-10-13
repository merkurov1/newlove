INSERT INTO postcards (id, title, description, image, price, available, featured, created_at, updated_at) VALUES
('postcard_sunset_001', 'Авторская открытка "Закат"', 'Уникальная открытка с авторским рисунком заката над городом', 'https://example.com/postcard-sunset.jpg', 2900, true, true, NOW(), NOW()),
('postcard_minimal_002', 'Открытка "Минимализм"', 'Стильная минималистичная открытка в черно-белых тонах', 'https://example.com/postcard-minimal.jpg', 2900, true, false, NOW(), NOW()),
('postcard_flowers_003', 'Цветочная композиция', 'Нежная открытка с изображением полевых цветов', 'https://example.com/postcard-flowers.jpg', 3200, true, true, NOW(), NOW());

INSERT INTO letters (id, title, slug, content, published, author_id, created_at, updated_at) VALUES
('letter_welcome_001', 'Добро пожаловать в мир авторских открыток', 'dobro-pozhalovat-v-mir-avtorskih-otkrytok', '<h2>Дорогие читатели!</h2><p>Рад приветствовать вас в новом разделе нашего сайта — <strong>Letters</strong>.</p>', true, 'user_id_here', NOW(), NOW()),
('letter_process_002', 'Процесс создания: от идеи до открытки', 'process-sozdaniya-ot-idei-do-otkrytki', '<h2>За кулисами творчества</h2><p>Многие спрашивают, как рождаются идеи для открыток.</p>', true, 'user_id_here', NOW(), NOW()),
('letter_personal_003', 'Искусство персонализации', 'iskusstvo-personalizatsii-delaem-otkrytki-osobennymi', '<h2>Личное прикосновение к каждой открытке</h2><p>Что превращает обычную открытку в особенную?</p>', true, 'user_id_here', NOW(), NOW());