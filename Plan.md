# Social Content Workflow Management Platform

Version: 2.0

---

# 1. Business Problem

## Hiện trạng

Hiện doanh nghiệp có quy trình như sau:

Content Team
↓

Upload video lên Google Drive

↓

Paste link vào Google Sheet

↓

Đội đăng bài mở Google Sheet

↓

Copy link

↓

Đăng Facebook thủ công

↓

Đánh dấu đã đăng

Quy trình này tồn tại nhiều vấn đề:

- Không có workflow rõ ràng.
- Không có phân quyền.
- Không biết ai đang xử lý bài nào.
- Không có người duyệt nội dung.
- Không có lịch đăng tập trung.
- Không có retry khi đăng lỗi.
- Không có thống kê.
- Google Sheet chỉ là nơi lưu dữ liệu, không quản lý quy trình.

---

# 2. Mục tiêu

Xây dựng hệ thống quản lý quy trình Content cho doanh nghiệp.

Google Sheet sẽ được loại bỏ hoàn toàn.

Google Drive vẫn là nơi lưu Media.

Web Admin trở thành nơi làm việc duy nhất của:

- Content Team
- Reviewer
- Publisher
- Admin

Toàn bộ workflow được quản lý trên hệ thống.

---

# 3. High Level Architecture

                    Web Admin

        ┌──────────────┬───────────────┐

        ▼                              ▼

 Content Workspace             Publish Workspace

        │                              │

        └──────────────┬───────────────┘

                       ▼

                 PostgreSQL

                       ▼

                Google Drive API

                       ▼

                Google Drive

                       ▼

                  BullMQ Worker

                       ▼

               Meta Graph API

                       ▼

                Facebook Pages

---

# 4. Vai trò hệ thống

## 4.1 Content User

Nhiệm vụ

- Upload video
- Upload ảnh
- Tạo Content
- Chỉnh sửa Content

Không được:

- Schedule
- Publish

---

## 4.2 Reviewer (Leader)

Nhiệm vụ

- Review Content
- Approve
- Reject
- Comment

---

## 4.3 Publisher

Nhiệm vụ

- Chọn bài đã được duyệt
- Chọn Fanpage
- Setup Caption
- Setup Hashtag
- Setup Thumbnail
- Chọn giờ đăng
- Retry bài lỗi

---

## 4.4 Admin

Toàn quyền.

- User
- Role
- Fanpage
- Token
- Dashboard
- Queue
- Audit Log

---

# 5. Workflow

## Bước 1

Content

↓

Tạo Content

↓

Upload Media

↓

Google Drive

↓

Status

DRAFT

---

## Bước 2

Content

↓

Submit Review

↓

Status

WAITING_APPROVAL

---

## Bước 3

Leader

↓

Review

↓

Approve

↓

Status

APPROVED

Hoặc

Reject

↓

REJECTED

---

## Bước 4

Publisher

↓

Danh sách

APPROVED

↓

Setup

- Caption
- Fanpage
- Schedule Time

↓

Status

SCHEDULED

---

## Bước 5

Đến giờ

BullMQ

↓

Publish

↓

Facebook

---

## Thành công

SUCCESS

---

## Lỗi

FAILED

↓

Retry

---

# 6. Content Lifecycle

NEW

↓

DRAFT

↓

WAITING_APPROVAL

↓

APPROVED

↓

SCHEDULED

↓

PUBLISHING

↓

SUCCESS

FAILED

↓

RETRY

↓

SUCCESS

---

# 7. Google Drive

Google Drive chỉ còn nhiệm vụ:

Media Storage.

Không còn:

Google Sheet.

---

Upload

Web Admin

↓

Backend

↓

Google Drive API

↓

Google Drive

↓

Trả về

fileId

↓

Lưu Database.

Database KHÔNG lưu video.

Chỉ lưu

- fileId
- mimeType
- size
- thumbnail

---

# 8. Database

## users

id

name

email

password

role

---

## roles

id

name

---

## permissions

id

code

---

## facebook_pages

id

page_name

page_id

access_token

---

## content_assets

id

title

description

category

media_type

drive_file_id

drive_url

thumbnail_url

created_by

approved_by

status

created_at

updated_at

---

## publish_jobs

id

content_asset_id

facebook_page_id

caption

hashtags

schedule_time

status

published_at

error_message

created_by

---

## comments

id

content_id

user_id

comment

created_at

---

## audit_logs

id

user

action

resource

before

after

created_at

---

# 9. Web Admin Modules

Authentication

Dashboard

User Management

Role Management

Permission Management

Content Library

Review Center

Publisher Center

Schedule Calendar

Facebook Pages

Queue Monitor

Failed Jobs

Audit Logs

System Settings

---

# 10. Content Library

Content User thấy:

+ Upload

+ Edit

+ Delete

+ Submit Review

Không thấy

Schedule.

---

# 11. Review Center

Leader thấy

Waiting Approval

Approve

Reject

Comment

History

---

# 12. Publisher Center

Publisher chỉ thấy

Approved

Content.

Có thể

Setup

Caption

Hashtag

Facebook Page

Publish Time

Priority

Save

---

# 13. Scheduler

BullMQ

Queue

publish-facebook

Delay Job

Retry

Dead Letter Queue

---

# 14. Facebook Publish

Worker

↓

Load Publish Job

↓

Load Content

↓

Download Stream từ Google Drive

↓

Upload Facebook

↓

Update Status

↓

Audit Log

Không lưu video lên Server.

Chỉ Stream.

---

# 15. Dashboard

Widgets

Content

Waiting Review

Approved

Scheduled

Publishing

Success

Failed

Top Publisher

Top Content Creator

Posts Today

Posts This Month

---

# 16. Future Features

Campaign

Content Calendar

Multi Platform

Facebook

Instagram

TikTok

Youtube

AI Caption

AI Hashtag

AI SEO

Approval Workflow nhiều cấp

Notification

Email

Telegram

Slack

---

# 17. Tech Stack

Backend

NestJS

Prisma

PostgreSQL

BullMQ

Redis

Google Drive API

Meta Graph API

Swagger

Docker

Pino

---

Frontend

React

Ant Design

React Query

---

Infrastructure

Docker Compose

Nginx

2 vCPU

4GB RAM

50GB SSD

---

# 18. Development Principle

Single Source of Truth:

PostgreSQL

Single Working Portal:

Web Admin

Media Storage:

Google Drive

Background Processing:

BullMQ

Authentication:

JWT

Authorization:

RBAC

Audit:

Every Action Must Be Logged

Architecture:

Clean Architecture

DDD-lite

Feature-first Module