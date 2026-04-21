CREATE TABLE admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE achievements (
    id VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(50) NOT NULL,
    conditionParams VARCHAR(500) NOT NULL,
    conditionType VARCHAR(50) NOT NULL,
    description VARCHAR(100),
    icon VARCHAR(50),
    icon_active VARCHAR(50),
    isActive boolean,
    createdAt DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
    id VARCHAR(50) NOT NULL,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(100),
    features VARCHAR(200),
    image VARCHAR(50),
    originalPrice decimal(10,2),
    price decimal(10,2),
    rating decimal(10,2),
    reviews int,
    taobalUrl Varchar(100),
    type Varchar(50),
    isPublished boolean,
    createdAt DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE ads_new_products (
    id VARCHAR(50) NOT NULL,
    productId VARCHAR(50),
    productName VARCHAR(50) NOT NULL,
    productDescription VARCHAR(100),
    productImageUrl Varchar(100),
    status Varchar(50),
    isPublished boolean,
    createdAt DATETIME,
    archivedAt Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE articles (
    id VARCHAR(50) NOT NULL,
    title VARCHAR(50) NOT NULL,
    excerpt VARCHAR(100) NOT NULL,
    content VARCHAR(1000),
    imageUrl Varchar(100),
    status Varchar(50),
    viewCount int,
    isPublished boolean,
    publishDate DATETIME,
    createUser int,
    createdAt DATETIME,
    updatedAt Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audios (
    id VARCHAR(50) NOT NULL,
    name VARCHAR(50) NOT NULL,
    fileName VARCHAR(50) NOT NULL,
    description VARCHAR(100),
    fileType VARCHAR(50),
    publicUrl Varchar(100),
    duration int,
    fileSize double,
    isPublished boolean,
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE record (
    id VARCHAR(50) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    mode_note VARCHAR(50),
    user_id VARCHAR(50),
    toy_id VARCHAR(50),
    duration int,
    createdAt DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sys_auth (
    id VARCHAR(50) NOT NULL,
    userid VARCHAR(50) NOT NULL,
    authModules VARCHAR(1000),
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sys_nickname (
    id VARCHAR(50) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    isEnable boolean,
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE sys_profilephoto (
    id VARCHAR(50) NOT NULL,
    fileName VARCHAR(50) NOT NULL,
    fileType VARCHAR(50),
    fileSize int,
    publicUrl VARCHAR(100),
    url VARCHAR(100),
    isPublished boolean,
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE user_achievements (
    id VARCHAR(50) NOT NULL,
    achievement_code VARCHAR(50) NOT NULL,
    context VARCHAR(500),
    userid varchar(100),
    createdAt DATETIME,
    earnedAt Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
    id VARCHAR(50) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    username VARCHAR(50) NOT NULL,
    authProvider VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    phoneVerified boolean,
    preferences varchar(500),
    status varchar(50),
    jiguangOperator varchar(50),
    jiguangRiskScore int,
    avatar Varchar(100),
    avatar_Url Varchar(100),
    birthDate VARCHAR(50),
    createdAt DATETIME,
    updatedAt Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waveforms (
    id VARCHAR(50) NOT NULL,
    name VARCHAR(50) NOT NULL,
    sequence JSON NOT NULL,
    isPublished boolean,
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waveforms_custom (
    id VARCHAR(50) NOT NULL,
    name VARCHAR(50) NOT NULL,
    sequence JSON NOT NULL,
    userid varchar(100),
    isPublished boolean,
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sys_auth (
    id VARCHAR(50) NOT NULL,
    authModules JSON NOT NULL,
    userid varchar(100),
    createTime DATETIME,
    updateTime Datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;