'use client';

import { useState } from 'react';
import { getWelcomeMessage, respond } from '@/lib/chatbot';
import { getStudentById } from '@/lib/database';
import type { Student } from '@/lib/database';
import styles from './ChatBot.module.css';

interface Message { sender: 'bot' | 'student'; text: string; }

interface Props { student: Student; }

export default function ChatBot({ student }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'bot', text: getWelcomeMessage(student.name) },
  ]);
  const [input, setInput] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    setMessages((m) => [...m, { sender: 'student', text: question }]);
    setInput('');
    const latest = getStudentById(student.id) || student;
    const reply = respond(question, latest);
    setTimeout(() => {
      setMessages((m) => [...m, { sender: 'bot', text: reply }]);
    }, 280);
  }

  return (
    <>
      <button className={styles.fab} onClick={() => setOpen((o) => !o)}>
        {open ? '✕ Close' : '💬 Ask Malsy'}
      </button>

      {open && (
        <div className={styles.popup}>
          <div className={styles.header}>
            <h3>Malsy AI Assistant</h3>
            <button className={styles.close} onClick={() => setOpen(false)}>×</button>
          </div>
          <p className={styles.subtitle}>Ask me about your progress, subjects, or what to study next!</p>
          <div className={styles.messages}>
            {messages.map((m, i) => (
              <div key={i} className={`${styles.msg} ${styles[m.sender]}`}>{m.text}</div>
            ))}
          </div>
          <form className={styles.form} onSubmit={handleSubmit}>
            <input
              className={styles.input}
              type="text"
              placeholder="Ask something…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className={styles.sendBtn}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}
