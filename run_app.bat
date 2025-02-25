@echo off

if not exist "venv\Scripts\activate" (
    echo Virtual environment not found. Creating one...
    python -m venv venv
    echo Installing requirements...
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)

python src/main.py
pause
