// src/ui/NewIdeas.tsx
import React from 'react';

export default function NewIdeas() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4 mt-4">
      <h3 className="text-base font-semibold text-slate-800 mb-2">Ideas for Future Versions</h3>
      <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
        <li>Add a library of stickers and emojis to decorate the cards.</li>
        <li>Allow users to choose from a variety of fonts for the card text.</li>
        <li>Create pre-made templates for holidays like Christmas, Halloween, and birthdays.</li>
        <li>Implement a sharing feature to send cards to friends via social media or email.</li>
        <li>Add a "deck builder" mode to create and manage collections of cards.</li>
      </ul>
    </div>
  );
}
